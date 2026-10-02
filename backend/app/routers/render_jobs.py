"""Render-job routes — thin delegation to render_jobs feature service."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.deps import get_current_user
from app.core.public_urls import public_file_url
from app.database import get_db
from app.features.render_jobs import service as render_job_service
from app.models.user import User
from app.schemas.render_job import (
    RenderJobCreate,
    RenderJobFailRequest,
    RenderJobPayload,
    RenderJobStatus,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared dependencies for worker endpoints
# ---------------------------------------------------------------------------


def _worker_auth(
    x_worker_token: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> None:
    """FastAPI dependency that validates the X-Worker-Token header."""
    render_job_service.require_worker_token(
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


@router.post("", status_code=201, response_model=RenderJobStatus)
def create_render_job(
    body: RenderJobCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderJobStatus:
    job = render_job_service.create_job(db, user, body)
    return _to_status(job)


@router.get("/{job_id}", response_model=RenderJobStatus)
def get_render_job(
    job_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderJobStatus:
    job = render_job_service.get_job_for_user(db, user, job_id)
    return _to_status(job)


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
    job = render_job_service.claim_job(db, settings)
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
    return render_job_service.get_job_payload(db, job_id, token=token)


@router.post("/{job_id}/complete")
async def complete_render_job(
    job_id: int,
    file: UploadFile,
    token: str = Depends(_job_token),
    db: Session = Depends(get_db),
):
    """Mark job completed; accepts multipart PNG upload; consumes 1 render credit.

    Secured by the per-job token only (see get_job_payload docstring).
    """
    data = await file.read()
    job = render_job_service.complete_job(db, job_id, token=token, data=data)
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
    job = render_job_service.fail_job(db, job_id, token=token, error=body.error)
    return _to_status(job)
