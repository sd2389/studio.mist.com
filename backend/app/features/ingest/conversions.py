"""Converting a batch's designs: a `convert` render job for each (docs/adr/0006-bulk-pipeline.md,
"Conversion jobs")."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.features.billing.plans import PlanTier, get_quotas
from app.features.ingest.designs import file_name
from app.features.render_jobs.convert_spec import ConvertFile, ConvertScene, ConvertSpec, normalised_convert_spec
from app.models import IngestBatch, IngestItem, RenderJob

# Batch jobs wait behind the studio's (100), and get as many attempts.
BATCH_PRIORITY = 10
MAX_ATTEMPTS = 3


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
