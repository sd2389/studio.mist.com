"""Render-job routes — thin delegation to the render_jobs feature services."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.deps import get_current_user, require_feature
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.features.render_jobs import outputs as render_job_outputs
from app.features.render_jobs import payload as render_job_payload
from app.features.render_jobs import quotes as render_job_quotes
from app.features.render_jobs import service as render_job_service
from app.features.render_jobs import worker as render_job_worker
from app.models.user import User
from app.schemas.render_job import (
    ArchiveJobPayload,
    ConvertJobPayload,
    RenderJobBulkCreate,
    RenderJobBulkOut,
    RenderJobBulkQuote,
    RenderJobClaim,
    RenderJobClaimRequest,
    RenderJobCompleteRequest,
    RenderJobCreate,
    RenderJobFailRequest,
    RenderJobHeartbeat,
    RenderJobHeartbeatOut,
    RenderJobOut,
    RenderJobPage,
    RenderJobPayload,
    RenderJobQuote,
    RenderJobStatus,
    RenderJobUploads,
    RenderJobUploadsRequest,
)

router = APIRouter()

_settings = get_settings()
_create_limit = rate_limit_dependency(
    "render-jobs.create",
    max_requests=_settings.rate_limit_render_jobs_per_hour,
    require_auth=True,
)
# Creating and quoting jobs are 404 while the server_exports flag is off. A job made before stays
# readable, cancelable and downloadable, and workers still render it.
_server_exports = [Depends(require_feature("server_exports", hidden=True))]

JobStatus = Literal["queued", "running", "completed", "failed", "canceled"]


# ---------------------------------------------------------------------------
# Shared dependencies for worker endpoints
# ---------------------------------------------------------------------------


def _worker_auth(
    x_worker_token: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    """FastAPI dependency that validates the X-Worker-Token header."""
    render_job_worker.require_worker_token(
        x_worker_token=x_worker_token,
        settings=settings,
    )


def _job_token(x_job_token: Annotated[str | None, Header()] = None) -> str:
    """The per-job token from the X-Job-Token header.

    A header rather than a query param: access logs record URLs, so a token in
    one would outlive the job in every log line.
    """
    if not x_job_token:
        raise HTTPException(status_code=401, detail="Missing job token")
    return x_job_token


# ---------------------------------------------------------------------------
# User-facing routes
# ---------------------------------------------------------------------------


@router.post("", status_code=201, response_model=RenderJobOut, dependencies=_server_exports)
def create_render_job(
    body: RenderJobCreate,
    response: Response,
    idempotency_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_create_limit)] = None,
) -> RenderJobOut:
    """201 with a new job, or 200 with the earlier job a repeated Idempotency-Key made."""
    job, created = render_job_service.create_job(db, user, body, idempotency_key)
    if not created:
        response.status_code = 200
    return render_job_service.job_view(db, job)


@router.post("/bulk", status_code=201, response_model=RenderJobBulkOut, dependencies=_server_exports)
def create_render_jobs(
    body: RenderJobBulkCreate,
    response: Response,
    idempotency_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_create_limit)] = None,
) -> RenderJobBulkOut:
    """201 with the new jobs, or 200 with the jobs an earlier request with the same Idempotency-Key made."""
    jobs, created = render_job_service.create_jobs(db, user, body, idempotency_key)
    if not created:
        response.status_code = 200
    return RenderJobBulkOut(jobs=render_job_service.job_views(db, jobs))


@router.post("/quote", response_model=RenderJobQuote, dependencies=_server_exports)
def quote_render_job(
    body: RenderJobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderJobQuote:
    return render_job_quotes.quote_job(db, user, body)


@router.post("/bulk/quote", response_model=RenderJobBulkQuote, dependencies=_server_exports)
def quote_render_jobs(
    body: RenderJobBulkCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderJobBulkQuote:
    """Each job's price, or why it can't be made, and the total; nothing is held or queued."""
    return render_job_quotes.quote_jobs(db, user, body.jobs)


@router.get("", response_model=RenderJobPage)
def list_render_jobs(
    scene_id: int | None = None,
    batch_id: int | None = None,
    kind: Annotated[str | None, Query(max_length=24)] = None,
    status: JobStatus | None = None,
    before: int | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderJobPage:
    jobs, next_before = render_job_service.list_jobs(
        db, user, scene_id=scene_id, batch_id=batch_id, kind=kind, status=status, before=before, limit=limit
    )
    return RenderJobPage(items=render_job_service.job_views(db, jobs), next_before=next_before)


@router.get("/{job_id}", response_model=RenderJobOut)
def get_render_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderJobOut:
    return render_job_service.job_view(db, render_job_service.get_job_for_user(db, user, job_id))


@router.post("/{job_id}/cancel", response_model=RenderJobOut)
def cancel_render_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderJobOut:
    return render_job_service.job_view(db, render_job_service.cancel_job(db, user, job_id))


@router.get("/{job_id}/outputs/{render_id}/download", response_model=None)
def download_render_job_output(
    job_id: int,
    render_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """302 to a signed URL valid for 300 s; on local storage, the file itself."""
    return render_job_service.download_output(db, user, job_id, render_id)


# ---------------------------------------------------------------------------
# Worker routes. Claims take X-Worker-Token; everything else takes only the job's own token,
# in X-Job-Token. The worker's Node process makes every call: the harness page holds no token.
# ---------------------------------------------------------------------------


@router.post("/claim", response_model=RenderJobClaim, responses={204: {"description": "Nothing to claim"}})
def claim_render_job(
    body: RenderJobClaimRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _: None = Depends(_worker_auth),
):
    """The next job of the kinds the worker renders, with its token and lease; 204 when there is none."""
    job = render_job_worker.claim_job(db, body.worker_id, body.kinds, settings)
    if job is None:
        return Response(status_code=204)
    return RenderJobClaim(
        job_id=job.id,
        job_token=job.worker_token,
        kind=job.kind,
        lease_seconds=settings.render_job_lease_seconds,
        heartbeat_seconds=render_job_worker.HEARTBEAT_SECONDS,
    )


@router.get("/{job_id}/payload", response_model=RenderJobPayload | ConvertJobPayload | ArchiveJobPayload)
def get_job_payload(
    job_id: int,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
) -> RenderJobPayload | ConvertJobPayload | ArchiveJobPayload:
    """What the harness renders the job from; for a convert job, the design's CAD files; for a
    batch_archive job, its batch's manifest and files."""
    return render_job_payload.job_payload(db, job_id, token)


@router.get("/{job_id}/inputs/model", response_class=FileResponse)
def get_job_model(job_id: int, token: str = Depends(_job_token), db: Session = Depends(get_db)):
    """The job's model, streamed (local storage only)."""
    return render_job_payload.model_file(db, job_id, token)


@router.get("/{job_id}/inputs/background", response_class=FileResponse)
def get_job_background(job_id: int, token: str = Depends(_job_token), db: Session = Depends(get_db)):
    """The look's background image, streamed (local storage only)."""
    return render_job_payload.background_file(db, job_id, token)


@router.get("/{job_id}/inputs/source", response_class=FileResponse)
def get_job_source(job_id: int, token: str = Depends(_job_token), db: Session = Depends(get_db)):
    """A convert job's CAD file, streamed (local storage only)."""
    return render_job_payload.convert_source_file(db, job_id, token)


@router.get("/{job_id}/inputs/companions/{index}", response_class=FileResponse)
def get_job_companion(job_id: int, index: int, token: str = Depends(_job_token), db: Session = Depends(get_db)):
    """One of a convert job's companion files, by its place in the spec, streamed (local storage only)."""
    return render_job_payload.convert_companion_file(db, job_id, token, index)


@router.get("/{job_id}/inputs/renders/{render_id}", response_class=FileResponse)
def get_archive_render(job_id: int, render_id: int, token: str = Depends(_job_token), db: Session = Depends(get_db)):
    """An output a batch_archive job's batch made, streamed (local storage only)."""
    return render_job_payload.archive_render_file(db, job_id, token, render_id)


@router.get("/{job_id}/inputs/thumbnails/{scene_id}", response_class=FileResponse)
def get_archive_thumbnail(job_id: int, scene_id: int, token: str = Depends(_job_token), db: Session = Depends(get_db)):
    """The thumbnail of a scene a batch_archive job's batch made, streamed (local storage only)."""
    return render_job_payload.archive_thumbnail_file(db, job_id, token, scene_id)


@router.post("/{job_id}/heartbeat", response_model=RenderJobHeartbeatOut)
def heartbeat_render_job(
    job_id: int,
    body: RenderJobHeartbeat,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RenderJobHeartbeatOut:
    """Extends the lease and records progress; `cancel` tells the worker to stop."""
    return render_job_worker.heartbeat(
        db, job_id, token, progress=body.progress, stage=body.stage, settings=settings
    )


@router.post("/{job_id}/uploads", response_model=RenderJobUploads)
def request_render_job_uploads(
    job_id: int,
    body: RenderJobUploadsRequest,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
) -> RenderJobUploads:
    """Where to PUT each output: URLs signed for 15 minutes, or on local storage the next route."""
    return RenderJobUploads(files=render_job_outputs.upload_targets(db, job_id, token, body.files))


@router.put("/{job_id}/uploads/{name}", status_code=204)
async def upload_render_job_output(
    job_id: int,
    name: str,
    request: Request,
    content_type: Annotated[str | None, Header()] = None,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
) -> Response:
    """One output's bytes (local storage only)."""
    await render_job_outputs.save_local_upload(db, job_id, token, name, content_type, request.stream())
    return Response(status_code=204)


@router.post("/{job_id}/complete", response_model=RenderJobStatus)
def complete_render_job(
    job_id: int,
    body: RenderJobCompleteRequest,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
) -> RenderJobStatus:
    """Completes the job with its uploaded outputs and charges the credits it held."""
    return RenderJobStatus.model_validate(render_job_outputs.complete_job(db, job_id, token, body))


@router.post("/{job_id}/fail", response_model=RenderJobStatus)
def fail_render_job(
    job_id: int,
    body: RenderJobFailRequest,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
) -> RenderJobStatus:
    """Retries the job after a backoff, or ends it refunded."""
    job = render_job_worker.fail_job(db, job_id, token, error=body.error, code=body.code, retryable=body.retryable)
    return RenderJobStatus.model_validate(job)
