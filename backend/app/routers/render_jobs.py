"""Render-job routes — thin delegation to render_jobs feature service."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.public_urls import public_file_url
from app.database import get_db
from app.features.render_jobs import service as render_job_service
from app.models.user import User
from app.schemas.render_job import RenderJobCreate, RenderJobStatus

router = APIRouter()


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
