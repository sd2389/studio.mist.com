"""File serving — delegate to file_access feature with tenant isolation."""

from fastapi import APIRouter, Depends

from app.core.deps import get_optional_user
from app.features.file_access.service import open_uploaded_file
from app.models.user import User

router = APIRouter()


@router.get("/{full_path:path}", response_model=None)
async def serve_uploaded_file(
    full_path: str,
    user: User | None = Depends(get_optional_user),
):
    return open_uploaded_file(full_path, user=user)
