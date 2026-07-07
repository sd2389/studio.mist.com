"""Render-job routes — thin delegation to render_jobs feature service."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Response, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.core.deps import get_current_user
from app.core.public_urls import public_file_url
from app.database import get_db
from app.features.render_jobs import service as render_job_service
from app.models.user import User
from app.schemas.render_job import RenderJobCreate, RenderJobPayload, RenderJobStatus

router = APIRouter()


# ---------------------------------------------------------------------------
# Shared dependency for worker endpoints
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
    _: None = Depends(_worker_auth),
):
    """Claim oldest queued job. Returns {job_id, page_token} or 204 when empty."""
    job = render_job_service.claim_job(db)
    if job is None:
        response.status_code = 204
        return None
    return {"job_id": job.id, "page_token": job.worker_token}


@router.get("/{job_id}/payload", response_model=RenderJobPayload)
def get_job_payload(
    job_id: int,
    token: str,
    db: Session = Depends(get_db),
    _: None = Depends(_worker_auth),
) -> RenderJobPayload:
    """Return render parameters. Requires matching per-job token query param."""
    return render_job_service.get_job_payload(db, job_id, token=token)


@router.post("/{job_id}/complete")
async def complete_render_job(
    job_id: int,
    token: str,
    file: UploadFile,
    db: Session = Depends(get_db),
    _: None = Depends(_worker_auth),
):
    """Mark job completed; accepts multipart PNG upload; consumes 1 render credit."""
    data = await file.read()
    job = render_job_service.complete_job(db, job_id, token=token, data=data)
    return _to_status(job)


@router.post("/{job_id}/fail")
def fail_render_job(
    job_id: int,
    token: str,
    body: dict,
    db: Session = Depends(get_db),
    _: None = Depends(_worker_auth),
):
    """Mark job failed or requeue for retry. Body: {error: str}."""
    error = body.get("error", "unknown error")
    job = render_job_service.fail_job(db, job_id, token=token, error=error)
    return _to_status(job)
