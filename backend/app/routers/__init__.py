from fastapi import APIRouter

from app.routers import ai_background, files, health, renders, scenes, upload

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"])
api_router.include_router(renders.router, prefix="/renders", tags=["renders"])
api_router.include_router(scenes.router, prefix="/scenes", tags=["scenes"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(ai_background.router, prefix="/ai-background", tags=["ai-background"])
