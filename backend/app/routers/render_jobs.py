"""Render-job routes — thin delegation to the render_jobs feature services."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.deps import get_current_user
from app.core.public_urls import public_file_url
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.features.render_jobs import service as render_job_service
from app.features.render_jobs import worker as render_job_worker
from app.models.user import User
from app.schemas.render_job import (
    RenderJobBulkCreate,
    RenderJobBulkOut,
    RenderJobCreate,
    RenderJobFailRequest,
    RenderJobOut,
    RenderJobPage,
    RenderJobPayload,
    RenderJobQuote,
    RenderJobStatus,
)

router = APIRouter()

_settings = get_settings()
_create_limit = rate_limit_dependency(
    "render-jobs.create",
    max_requests=_settings.rate_limit_render_jobs_per_hour,
    require_auth=True,
)

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
# Helpers
# ---------------------------------------------------------------------------


def _to_status(job) -> RenderJobStatus:
    result_url = public_file_url(job.result_key) if job.result_key else None
    return RenderJobStatus(
        id=job.id,
        status=job.status,
        result_url=result_url,
        error=job.error,
        attempts=job.attempts,
        created_at=job.created_at,
    )


# ---------------------------------------------------------------------------
# User-facing routes
# ---------------------------------------------------------------------------


@router.post("", status_code=201, response_model=RenderJobOut)
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


@router.post("/bulk", status_code=201, response_model=RenderJobBulkOut)
def create_render_jobs(
    body: RenderJobBulkCreate,
    idempotency_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_create_limit)] = None,
) -> RenderJobBulkOut:
    jobs = render_job_service.create_jobs(db, user, body.jobs, idempotency_key)
    return RenderJobBulkOut(jobs=render_job_service.job_views(db, jobs))


@router.post("/quote", response_model=RenderJobQuote)
def quote_render_job(
    body: RenderJobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderJobQuote:
    return render_job_service.quote_job(db, user, body)


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
# Worker routes
# ---------------------------------------------------------------------------


@router.post("/claim")
def claim_render_job(
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _: None = Depends(_worker_auth),
):
    """Claim the next job. Returns {job_id, page_token, lease_seconds} or 204 when empty.

    The worker has to finish within lease_seconds; after that the next claim
    takes the job back and page_token stops working.
    """
    job = render_job_worker.claim_job(db, settings)
    if job is None:
        response.status_code = 204
        return None
    return {
        "job_id": job.id,
        "page_token": job.worker_token,
        "lease_seconds": settings.render_job_lease_seconds,
    }


@router.get("/{job_id}/payload", response_model=RenderJobPayload)
def get_job_payload(
    job_id: int,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
) -> RenderJobPayload:
    """Return render parameters. Secured by the per-job token (X-Job-Token) only.

    X-Worker-Token is NOT required here: the browser harness page (running inside
    the worker's Playwright browser) calls this endpoint, and the shared worker
    secret never enters that page. The per-job token is a UUID hex issued at
    claim time and serves as the sole credential for payload/complete/fail.
    """
    return render_job_worker.get_job_payload(db, job_id, token=token)


@router.post("/{job_id}/complete")
async def complete_render_job(
    job_id: int,
    file: UploadFile,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
):
    """Mark job completed; accepts multipart PNG upload; charges the credits it held.

    Secured by the per-job token only (see get_job_payload docstring).
    """
    data = await file.read()
    job = render_job_worker.complete_job(db, job_id, token=token, data=data)
    return _to_status(job)


@router.post("/{job_id}/fail")
def fail_render_job(
    job_id: int,
    body: RenderJobFailRequest,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
):
    """Mark job failed or requeue for retry. Body: {error: str}.

    Secured by the per-job token only (see get_job_payload docstring).
    """
    job = render_job_worker.fail_job(db, job_id, token=token, error=body.error)
    return _to_status(job)
