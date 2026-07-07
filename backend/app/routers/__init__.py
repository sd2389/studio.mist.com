from fastapi import APIRouter

from app.routers import (
    admin,
    ai_background,
    auth,
    billing,
    catalog,
    feature_flags,
    files,
    health,
    library,
    render_jobs,
    renders,
    scenes,
    upload,
)

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(upload.router, prefix="/upload", tags=["upload"])
api_router.include_router(renders.router, prefix="/renders", tags=["renders"])
api_router.include_router(scenes.router, prefix="/scenes", tags=["scenes"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(ai_background.router, prefix="/ai-background", tags=["ai-background"])
api_router.include_router(catalog.router, prefix="/catalog", tags=["catalog"])
api_router.include_router(library.router, prefix="/library", tags=["library"])
api_router.include_router(billing.router, prefix="/billing", tags=["billing"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(feature_flags.router, prefix="/features", tags=["features"])
api_router.include_router(render_jobs.router, prefix="/render-jobs", tags=["render-jobs"])
