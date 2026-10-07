"""Batch results tests (docs/adr/0006-bulk-pipeline.md, "Results"): a finished batch with every
output rendered, and a fake CPU worker that builds its archive as the real one does: it reads the
payload, fetches each file by its signed URL, zips them into parts (the manifest first) and
uploads and completes them."""

import io
import zipfile

import pytest
from ingest_samples import SIGNED, WORKER_SETTINGS, batch_body, designs, submitted_batch
from render_samples import DEFAULT_PLAN, convert_all

from app.features.render_jobs import outputs, worker
from app.features.render_jobs import payload as job_payload
from app.models import RenderJob
from app.schemas.render_job import ArchiveJobPayload, RenderJobCompleteRequest, RenderJobUploadFile


def finished_batch(client, headers, cloud, db, gpu, count: int = 2, plan: dict = DEFAULT_PLAN, prefix: str = "R") -> dict:
    """A batch of `count` designs (SKUs `<prefix>-1`, …), converted and with every render of
    `plan` completed."""
    batch = submitted_batch(client, headers, cloud, batch_body(*designs(count, prefix), render_plan=plan))
    convert_all(db, cloud)
    gpu.run_all()
    return batch


def signed_key(url: str) -> str:
    """The key a MemoryCloud signed GET names."""
    return url.removeprefix(SIGNED).split("?", 1)[0]


def unzip(data: bytes) -> dict[str, bytes]:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        return {name: archive.read(name) for name in archive.namelist()}


class FakeArchiveWorker:
    def __init__(self, db, cloud) -> None:
        self.db = db
        self.cloud = cloud

    def claim(self) -> RenderJob | None:
        return worker.claim_job(self.db, "cpu-a-1", ["batch_archive"], WORKER_SETTINGS)

    def claim_one(self) -> RenderJob:
        job = self.claim()
        assert job is not None, "no archive to build"
        return job

    def payload(self, job: RenderJob) -> ArchiveJobPayload:
        return job_payload.job_payload(self.db, job.id, job.worker_token)

    def parts(self, job: RenderJob, first_part_files: int | None = None) -> list[tuple[str, bytes, int]]:
        """The job's parts as (name, bytes, files): the manifest, then every file, the first
        `first_part_files` of them in the first part and the rest in a second."""
        payload = self.payload(job)
        entries = [(payload.manifest_name, payload.manifest.encode())]
        entries += [(file.path, self.cloud.objects[signed_key(file.source.url)]) for file in payload.files]
        split = len(entries) if first_part_files is None else 1 + first_part_files
        groups = [entries[:split], entries[split:]] if split < len(entries) else [entries]
        parts = []
        for number, group in enumerate(groups, start=1):
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                for name, data in group:
                    archive.writestr(name, data)
            parts.append((f"{job.spec['stem']}-part-{number}.zip", buffer.getvalue(), len(group)))
        return parts

    def upload(self, job: RenderJob, parts: list[tuple[str, bytes, int]]) -> list[dict]:
        files = [RenderJobUploadFile(name=name, content_type="application/zip", bytes=len(data)) for name, data, _ in parts]
        targets = outputs.upload_targets(self.db, job.id, job.worker_token, files)
        reports = []
        for target, (name, data, count) in zip(targets, parts, strict=True):
            self.cloud.objects[target.key] = data
            reports.append({
                "name": name, "key": target.key, "content_type": "application/zip", "bytes": len(data),
                "width": None, "height": None, "label": None, "meta": {"files": count},
            })
        return reports

    def complete(self, job: RenderJob, reports: list[dict]) -> RenderJob:
        body = RenderJobCompleteRequest.model_validate({"outputs": reports})
        return outputs.complete_job(self.db, job.id, job.worker_token, body)

    def build(self, first_part_files: int | None = None) -> RenderJob:
        """Claim the archive waiting, and make, upload and complete its parts."""
        job = self.claim_one()
        return self.complete(job, self.upload(job, self.parts(job, first_part_files)))


@pytest.fixture()
def archiver(db, cloud) -> FakeArchiveWorker:
    return FakeArchiveWorker(db, cloud)
