"""Render artifact routes — delegate to render feature."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.database import get_db
from app.features.render import service as render_service
from app.models.user import User
from app.schemas.render import RenderSaveRequest
from app.schemas.scene import RenderItem

router = APIRouter()


@router.post("")
async def save_render(
    body: RenderSaveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool | str | int | None]:
    return render_service.save_render_from_data_url(db, body, user.id)


@router.get("", response_model=list[RenderItem])
def list_renders(
    scene_id: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[RenderItem]:
    return render_service.list_renders_for_scene(db, scene_id, user.id)
