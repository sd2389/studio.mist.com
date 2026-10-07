"""Bulk upload routes — thin delegation to the ingest feature (docs/adr/0006-bulk-pipeline.md)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user, require_feature
from app.core.rate_limit import rate_limit_dependency
from app.database import get_db
from app.features.ingest import lifecycle as ingest_lifecycle
from app.features.ingest import saved_templates
from app.features.ingest import service as ingest_service
from app.features.ingest import uploads as ingest_uploads
from app.models.user import User
from app.schemas.ingest import (
    IngestBatchCreate,
    IngestBatchCreated,
    IngestBatchOut,
    IngestBatchPage,
    IngestItemIds,
    IngestItemOut,
    IngestItemPage,
    IngestRenderPlanQuote,
    IngestRenderPlanQuoteIn,
    IngestRetried,
    IngestSkuCheck,
    IngestSkuCheckOut,
    IngestUploaded,
    IngestUploads,
    ItemStatus,
    LookTemplateList,
    LookTemplateOut,
)

router = APIRouter()

_settings = get_settings()
# One hit a call, however many designs or files it names.
_batch_call = rate_limit_dependency(
    "ingest",
    max_requests=_settings.rate_limit_ingest_per_hour,
    require_auth=True,
)
# Adding work needs the bulk_pipeline flag (404 while it is off) and the upload flag (503).
# Reading batches and canceling one don't: a batch in flight can always be canceled for its refunds.
_adds_work = [Depends(require_feature("bulk_pipeline", hidden=True)), Depends(require_feature("upload"))]


@router.post("/batches", status_code=201, response_model=IngestBatchCreated, dependencies=_adds_work)
def create_batch(
    body: IngestBatchCreate,
    response: Response,
    idempotency_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> IngestBatchCreated:
    """201 with the new batch and its designs, or 200 with the batch a repeated Idempotency-Key made."""
    batch, created = ingest_service.create_batch(db, user, body, idempotency_key)
    if not created:
        response.status_code = 200
    return ingest_service.created_view(db, batch)


@router.post("/render-plan/quote", response_model=IngestRenderPlanQuote, dependencies=_adds_work)
def quote_render_plan(
    body: IngestRenderPlanQuoteIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IngestRenderPlanQuote:
    """What a render plan costs each design; 400 and 402 as a batch with it would be refused. Nothing is made."""
    return ingest_service.quote_render_plan(db, user, body.render_plan)


@router.post("/sku-check", response_model=IngestSkuCheckOut, dependencies=_adds_work)
def check_skus(
    body: IngestSkuCheck,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> IngestSkuCheckOut:
    return ingest_service.check_skus(db, body.skus)


@router.get("/batches", response_model=IngestBatchPage)
def list_batches(
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IngestBatchPage:
    return ingest_service.list_batches(db, user, page, limit)


@router.get("/batches/{batch_id}", response_model=IngestBatchOut)
def get_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IngestBatchOut:
    return ingest_service.batch_view(db, ingest_service.owned_batch(db, user, batch_id))


@router.get("/batches/{batch_id}/items", response_model=IngestItemPage)
def list_batch_items(
    batch_id: int,
    status: ItemStatus | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> IngestItemPage:
    return ingest_service.list_items(db, user, batch_id, status, page, limit)


@router.post("/batches/{batch_id}/uploads", response_model=IngestUploads, dependencies=_adds_work)
def sign_uploads(
    batch_id: int,
    body: IngestItemIds,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> IngestUploads:
    """A signed PUT for each file of the designs named, with the headers to send."""
    return ingest_uploads.upload_targets(db, user, batch_id, body.item_ids)


@router.post("/batches/{batch_id}/uploaded", response_model=IngestUploaded, dependencies=_adds_work)
def confirm_uploads(
    batch_id: int,
    body: IngestItemIds,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> IngestUploaded:
    return ingest_uploads.confirm_uploads(db, user, batch_id, body.item_ids)


@router.post("/batches/{batch_id}/submit", response_model=IngestBatchOut, dependencies=_adds_work)
def submit_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> IngestBatchOut:
    """Holds the batch's credits and starts converting its uploaded designs."""
    return ingest_service.batch_view(db, ingest_lifecycle.submit_batch(db, user, batch_id))


@router.post("/batches/{batch_id}/retry-failed", response_model=IngestRetried, dependencies=_adds_work)
def retry_failed(
    batch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> IngestRetried:
    batch, retried, refused = ingest_lifecycle.retry_items(db, user, batch_id)
    return IngestRetried(batch=ingest_service.batch_view(db, batch), retried=retried, refused=refused)


@router.post("/batches/{batch_id}/items/{item_id}/retry", response_model=IngestItemOut, dependencies=_adds_work)
def retry_item(
    batch_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> IngestItemOut:
    [item] = ingest_service.item_views(db, [ingest_lifecycle.retry_item(db, user, batch_id, item_id)])
    return item


@router.get("/look-templates", response_model=LookTemplateList)
def list_look_templates(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LookTemplateList:
    """The caller's look templates, the latest made first."""
    templates = saved_templates.list_templates(db, user, limit)
    return LookTemplateList(items=[saved_templates.template_view(db, template) for template in templates])


@router.post(
    "/look-templates/from-scene/{scene_id}", status_code=201, response_model=LookTemplateOut, dependencies=_adds_work
)
def look_template_from_scene(
    scene_id: int,
    response: Response,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> LookTemplateOut:
    """201 with a template of the caller's scene's look, or 200 with that scene's template brought
    up to date; 404 for a scene that isn't theirs."""
    template, created = saved_templates.template_from_scene(db, user, scene_id)
    if not created:
        response.status_code = 200
    return saved_templates.template_view(db, template)


@router.post("/batches/{batch_id}/cancel", response_model=IngestBatchOut)
def cancel_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_batch_call)] = None,
) -> IngestBatchOut:
    """Cancels what hasn't finished and gives its credits back."""
    return ingest_service.batch_view(db, ingest_lifecycle.cancel_batch(db, user, batch_id))
