"""Render plan tests (docs/adr/0006-bulk-pipeline.md, "Render plans"): the ADR's default plan, a
fake GPU worker that drives a batch's render jobs through complete and fail, and reading what
they come to."""

import pytest
from image_samples import raster
from ingest_samples import WORKER_SETTINGS, batch_body, claim, complete, converted_files, designs, item_row, submitted_batch

from app.features.billing.credit_pools import bought_credits
from app.features.billing.purchases import record_topup_purchase
from app.features.billing.quota_service import get_or_create_billing
from app.features.render_jobs import worker
from app.models import Render, RenderJob, Scene, User

STUDIO = (500, 1500)  # Studio's model and render credits a month
GPU_KINDS = ["still", "angle_set", "turntable", "spin"]
ANGLES = ["front", "three-quarter", "side", "top"]
# The ADR's default plan: four 2000 px stills (a credit each) and 6 s of 1080² at 30 fps (3).
DEFAULT_PLAN = {
    "stills": {"angles": ANGLES, "size": 2000, "format": "jpeg"},
    "turntable": {"width": 1080, "height": 1080, "fps": 30, "seconds": 6, "quality": "high"},
    "thumbnail_from": "front",
}
PER_DESIGN = 7
STILL = raster("JPEG", (2000, 2000))
MP4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 64
ZIP = b"PK\x03\x04" + b"\x00" * 64


class FakeGpuWorker:
    """A GPU worker as the API sees one: it claims a batch's render jobs, uploads every file their
    specs name to the cloud, and completes them, or fails them with a code."""

    def __init__(self, db, cloud) -> None:
        self.db = db
        self.cloud = cloud

    def claim(self, kinds: list[str] = GPU_KINDS) -> RenderJob | None:
        return worker.claim_job(self.db, "gpu-a-1", kinds, WORKER_SETTINGS)

    def claim_kind(self, kind: str) -> RenderJob:
        job = self.claim([kind])
        assert job is not None, f"no {kind} job to claim"
        return job

    def _files(self, job: RenderJob) -> list[dict]:
        spec = job.spec
        if job.kind == "turntable":
            return [{"name": spec["output_names"][0], "type": "video/mp4", "data": MP4, "size": (spec["width"], spec["height"]), "label": None}]
        if job.kind == "spin":
            return [{"name": spec["output_names"][0], "type": "application/zip", "data": ZIP, "size": (spec["size"], spec["size"]), "label": None}]
        return [
            {"name": name, "type": "image/jpeg", "data": STILL, "size": (spec["width"], spec["height"]), "label": camera["angle"]}
            for name, camera in zip(spec["output_names"], spec["cameras"], strict=True)
        ]

    def complete(self, job: RenderJob) -> RenderJob:
        reports = []
        for file in self._files(job):
            key = f"customers/{job.user_id}/renders/{job.id}/{file['name']}"
            self.cloud.objects[key] = file["data"]
            width, height = file["size"]
            reports.append({
                "name": file["name"], "key": key, "content_type": file["type"], "bytes": len(file["data"]),
                "width": width, "height": height, "label": file["label"],
            })
        return complete(self.db, job, reports)

    def fail(self, job: RenderJob, code: str = "encode_failed", retryable: bool = True) -> RenderJob:
        failed = worker.fail_job(self.db, job.id, job.worker_token, error=f"{code}!", code=code, retryable=retryable)
        if failed.status == "queued":  # past its backoff, as a later claim would find it
            failed.run_after = None
            self.db.commit()
        return failed

    def run_all(self) -> None:
        """Complete every render job there is to claim."""
        while (job := self.claim()) is not None:
            self.complete(job)


@pytest.fixture()
def gpu(db, cloud) -> FakeGpuWorker:
    return FakeGpuWorker(db, cloud)


def convert_all(db, cloud) -> None:
    """A CPU worker converts every design waiting, each into its scene."""
    while (job := claim(db)) is not None:
        complete(db, job, converted_files(cloud, job))


def design_jobs(db, item_id: int) -> list[RenderJob]:
    db.expire_all()
    return db.query(RenderJob).filter(RenderJob.ingest_item_id == item_id, RenderJob.kind != "convert").order_by(RenderJob.id).all()


def batch_outputs(db, batch_id: int) -> list[Render]:
    return db.query(Render).join(RenderJob, Render.job_id == RenderJob.id).filter(RenderJob.batch_id == batch_id).all()


def scene_of(db, item_id: int) -> Scene:
    return db.get(Scene, item_row(db, item_id).scene_id)


def batch_view(client, headers, batch: dict) -> dict:
    return client.get(f"/ingest/batches/{batch['id']}", headers=headers).json()


def planned_batch(client, headers, cloud, count: int = 1, plan: dict = DEFAULT_PLAN) -> dict:
    """A batch of `count` designs rendering `plan`, made, uploaded and submitted."""
    return submitted_batch(client, headers, cloud, batch_body(*designs(count), render_plan=plan))


def buy(db, user: User, kind: str, credits: int) -> None:
    """A paid top-up, as the Stripe webhook records it."""
    record_topup_purchase(
        db, get_or_create_billing(db, user), kind=kind, credits=credits,
        session_id=f"cs_{kind}", event_id=f"evt_{kind}", amount_total=None, currency=None,
    )


def set_balances(db, user: User, model: int, render: int) -> None:
    billing = get_or_create_billing(db, user)
    billing.model_credits_balance = model
    billing.render_credits_balance = render
    db.commit()


def bought(db, user: User) -> tuple[int, int]:
    """(model credits, render credits) bought, of those left."""
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return bought_credits(billing, "model"), bought_credits(billing, "render")


