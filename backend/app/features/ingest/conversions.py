"""Converting a batch's designs: a `convert` render job for each, and completing one, which makes
the design's scene as a direct upload makes one (docs/adr/0006-bulk-pipeline.md, "Conversion jobs").

The job's files (render_jobs/convert_spec.py) are checked for their names, types and stored
sizes like any job's outputs. Then the model passes what every upload passes, each failure the
design's reason: a real GLB (model_unreadable), its own triangle count within the owner's plan
(over_polygon_cap), room in storage (over_limit), its SKU still free (sku_taken). The scene, the
design's spent model credit and the completed job are saved in one commit, so a job completes
once and makes one scene; a design that fails gets back what it holds.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Annotated, Literal, TypeVar

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.core.validation import validation_detail
from app.features.billing.plans import PlanTier, get_quotas
from app.features.billing.quota_service import assert_polygon_limit, assert_storage_for_upload, count_storage_bytes
from app.features.ingest.designs import file_name
from app.features.ingest.items import settle_batch
from app.features.render_jobs.convert_spec import (
    MAX_REPORT_BYTES,
    MODEL_OUTPUT,
    REPORT_OUTPUT,
    THUMBNAIL_OUTPUT,
    ConvertFile,
    ConvertScene,
    ConvertSpec,
    normalised_convert_spec,
)
from app.features.render_jobs.worker import discard_outputs, end_attempt, running_job
from app.features.scene.look import PRESET_ID, ModelConfig, normalize_slot_id
from app.features.scene.skus import assert_sku_available
from app.features.upload.service import SceneDetails, count_model_triangles, create_scene_from_glb, read_stored_upload
from app.features.upload.thumbnails import read_checked_thumbnail
from app.models import IngestBatch, IngestItem, RenderJob, Scene, User
from app.schemas.render_job import RenderJobOutputReport, RendererInfo

# Batch jobs wait behind the studio's (100), and get as many attempts.
BATCH_PRIORITY = 10
MAX_ATTEMPTS = 3

T = TypeVar("T")
SlotId = Annotated[str, Field(min_length=1, max_length=128)]


class ReportPart(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class ConversionUnits(ReportPart):
    """How the converter sized the piece: millimetres per unit of the file, how it decided
    (the file's own unit, one it detected, millimetres it assumed, or the design's `units`), and
    the piece's size in millimetres along x, y and z."""

    mm_per_unit: float = Field(gt=0, le=1_000_000)
    source: Literal["declared", "detected", "assumed", "override"]
    size_mm: list[Annotated[float, Field(ge=0, le=100_000)]] = Field(min_length=3, max_length=3)


class ConversionReport(ReportPart):
    """conversion.json: what converting a design found. `roles` names each slot's majority
    jewelryRole; slot selections are preset materials. Both name slots of the model config."""

    model_config_data: ModelConfig = Field(alias="model_config")
    slot_selections: dict[SlotId, Annotated[str, Field(pattern=PRESET_ID)]] = Field(default_factory=dict, max_length=256)
    polygon_count: int = Field(ge=0)  # as the converter counted; the API counts the GLB itself
    units: ConversionUnits
    roles: dict[SlotId, Literal["metal", "gem", "accent"]] = Field(default_factory=dict, max_length=256)
    warnings: list[Annotated[str, Field(max_length=500)]] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _names_its_slots(self) -> ConversionReport:
        slots = {normalize_slot_id(slot.slotId) for slot in self.model_config_data.slots or []}
        for field, named in (("slot_selections", self.slot_selections), ("roles", self.roles)):
            unknown = [slot for slot in named if slots and normalize_slot_id(slot) not in slots]
            if unknown:
                raise ValueError(f"{field} names slots the model config hasn't: {', '.join(unknown)}")
        return self

    def model_config_with_roles(self) -> dict:
        """The model config to store, each slot with its role (which look templates go by, F1)."""
        config = self.model_config_data.model_dump(mode="json", by_alias=True, exclude_unset=True)
        roles = {normalize_slot_id(slot): role for slot, role in self.roles.items()}
        for slot in config.get("slots") or []:
            if role := roles.get(normalize_slot_id(slot["slotId"])):
                slot["role"] = role
        return config


class DesignRefused(Exception):
    """The converted model can't become the design's scene: the design fails with `code`."""

    def __init__(self, code: str, status_code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.message = message


class DesignGone(Exception):
    """The design stopped converting (its batch was canceled) while its job ran."""


def queue_conversions(db: Session, batch: IngestBatch, items: list[IngestItem], tier: PlanTier, now: datetime) -> None:
    """A convert job for each design, which then converts. The caller has locked the designs and
    holds their credits. Not committed."""
    quotas = get_quotas(tier)
    jobs = [
        RenderJob(
            user_id=item.user_id,
            batch_id=batch.id,
            ingest_item_id=item.id,
            kind="convert",
            spec=normalised_convert_spec(_convert_spec(batch, item, quotas.max_polygons)),
            look=None,
            watermark=False,  # a thumbnail is the piece's product picture, not an export
            priority=BATCH_PRIORITY,
            max_running=quotas.max_running_jobs,
            max_attempts=MAX_ATTEMPTS,
            credits=0,  # a design costs a model credit, held on the design
            credit_state="none",
            status="queued",
            attempts=0,
            created_at=now,
            updated_at=now,
        )
        for item in items
    ]
    db.add_all(jobs)
    db.flush()
    for item, job in zip(items, jobs, strict=True):
        item.status = "converting"
        item.convert_job_id = job.id
        item.updated_at = now


def _convert_spec(batch: IngestBatch, item: IngestItem, max_polygons: int) -> ConvertSpec:
    return ConvertSpec(
        item_id=item.id,
        source=ConvertFile(key=item.source_key, filename=file_name(item.filename), bytes=item.source_bytes),
        companions=[
            ConvertFile(key=companion["key"], filename=file_name(companion["filename"]), bytes=companion["bytes"])
            for companion in item.companions
        ],
        units=item.units,
        max_polygons=max_polygons,
        decimate=batch.options.get("decimate", "auto"),
        scene=ConvertScene(sku=item.sku, name=item.name, category=item.category, note=item.note),
    )


def _read_report(key: str) -> ConversionReport:
    """conversion.json, checked: 400 when it isn't a report, and the job keeps running."""
    try:
        return ConversionReport.model_validate_json(storage.read_bytes(key, max_bytes=MAX_REPORT_BYTES))
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=validation_detail(exc, REPORT_OUTPUT)) from exc


def _refused_as(code: str, check: Callable[[], T]) -> T:
    """Run one of the upload checks; what it refuses, the design fails with as `code`."""
    try:
        return check()
    except HTTPException as exc:
        raise DesignRefused(code, exc.status_code, str(exc.detail)) from exc


def _record_conversion(
    db: Session, job: RenderJob, item: IngestItem, scene: Scene, upload_bytes: int, triangles: int,
    report: ConversionReport, renderer: RendererInfo,
) -> None:
    """What the design's scene is saved with: the design holding its scene, done (converted,
    when its batch renders it next), its model credit spent once; its storage counted; the job
    completed; its batch settled. Not committed."""
    now = datetime.utcnow()
    renders_next = db.get(IngestBatch, item.batch_id).render_plan is not None
    spent = db.execute(
        update(IngestItem)
        .where(
            IngestItem.id == item.id,
            IngestItem.status == "converting",
            IngestItem.convert_job_id == job.id,
            IngestItem.model_credit_held == 1,
        )
        .values(
            status="converted" if renders_next else "done",
            scene_id=scene.id,
            model_credit_held=0,
            polygon_count=triangles,
            size_mm=max(report.units.size_mm),
            warnings=report.warnings,
            error=None,
            error_code=None,
            updated_at=now,
        )
        .execution_options(synchronize_session=False)
    ).rowcount
    if spent != 1:
        raise DesignGone()
    count_storage_bytes(db, job.user_id, upload_bytes)
    job.status = "completed"
    job.progress = 1.0
    job.stage = None
    job.error = None
    job.error_code = None
    job.renderer = renderer.model_dump(mode="json")
    job.finished_at = now
    job.updated_at = now
    settle_batch(db, item.batch_id)


def _make_scene(
    db: Session, job: RenderJob, item: IngestItem, files: dict[str, RenderJobOutputReport], renderer: RendererInfo
) -> Scene:
    report = _read_report(files[REPORT_OUTPUT].key)
    model_bytes = read_stored_upload(files[MODEL_OUTPUT].key)
    thumbnail = read_checked_thumbnail(job.user_id, files[THUMBNAIL_OUTPUT].key) if THUMBNAIL_OUTPUT in files else None
    upload_bytes = len(model_bytes) + (len(thumbnail.data) if thumbnail else 0)
    owner = db.get(User, job.user_id)
    _refused_as("sku_taken", lambda: assert_sku_available(db, item.sku, item_id=item.id))
    triangles = _refused_as("model_unreadable", lambda: count_model_triangles(model_bytes))
    _refused_as("over_polygon_cap", lambda: assert_polygon_limit(db, owner, triangles))
    _refused_as("over_limit", lambda: assert_storage_for_upload(db, owner, upload_bytes))
    details = SceneDetails(
        name=item.name,
        sku=item.sku,
        category=item.category,
        note=item.note,
        model_config=report.model_config_with_roles(),
        slot_selections=report.slot_selections or None,
    )
    try:
        return create_scene_from_glb(
            db,
            owner,
            model_key=keys.model_key(owner.id, file_name(item.filename)),
            model_bytes=model_bytes,
            details=details,
            pay=lambda scene: _record_conversion(db, job, item, scene, upload_bytes, triangles, report, renderer),
            thumbnail=thumbnail,
        )
    except HTTPException as exc:
        # The save lost a race: a plain upload took the SKU (409), or storage filled up (402).
        if exc.status_code not in (402, 409):
            raise
        raise DesignRefused("sku_taken" if exc.status_code == 409 else "over_limit", exc.status_code, str(exc.detail)) from exc


def _end_design(db: Session, job_id: int, token: str, code: str, error: str, status_code: int) -> HTTPException:
    """End the job, and with it its design (items.end_item_of_job), delete what the job
    uploaded, and the error the worker gets. A save that failed let the job's row go, so it is
    locked again first."""
    db.rollback()
    job = running_job(db, job_id, token)
    end_attempt(db, job, datetime.utcnow(), code=code, error=error, retryable=False)
    db.commit()
    discard_outputs(job)
    return HTTPException(status_code=status_code, detail=f"{error} The design has ended and its credits were refunded.")


def complete_conversion(
    db: Session, job: RenderJob, token: str, files: dict[str, RenderJobOutputReport], renderer: RendererInfo
) -> RenderJob:
    """Complete a running convert job with its files, checked already and keyed by name: its
    design becomes a scene, or fails with the reason its model was refused (the job ends failed,
    refunded). 400 when conversion.json isn't a report, and the job keeps running; 409 when the
    design stopped converting meanwhile, and the job ends."""
    item = db.get(IngestItem, job.ingest_item_id) if job.ingest_item_id is not None else None
    if item is None or item.status != "converting" or item.convert_job_id != job.id:
        raise _end_design(db, job.id, token, "canceled", "The design is no longer converting.", 409)
    try:
        _make_scene(db, job, item, files, renderer)
    except DesignRefused as refused:
        raise _end_design(db, job.id, token, refused.code, refused.message, refused.status_code) from refused
    except DesignGone as gone:
        raise _end_design(db, job.id, token, "canceled", "The design was canceled while it converted.", 409) from gone
    discard_outputs(job)  # the scene keeps checked copies under keys of its own
    db.refresh(job)
    return job
