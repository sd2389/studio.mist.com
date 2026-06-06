from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.deps import get_current_user, require_feature
from app.database import get_db
from app.features.billing.quota_service import assert_ai_image_credit, consume_ai_image_credit
from app.core.observability import get_logger, log_event
from app.core.rate_limit import rate_limit_dependency
from app.core.public_urls import public_file_url
from app.models.user import User
from app.schemas.ai import AiBackgroundBody
from app.services import ai_background as ai_svc
from app.services import ai_on_model as on_model_svc
from app.services.ai_presets import resolve_prompt

router = APIRouter(dependencies=[Depends(require_feature("ai_background"))])
logger = get_logger("studio.ai")

_settings = get_settings()
_ai_limit = rate_limit_dependency(
    "ai.background",
    max_requests=_settings.rate_limit_ai_background_per_hour,
    require_auth=True,
)


def _run_background_pipeline(im, prompt: str, mode: str) -> bytes:
    if mode == "stub":
        return ai_svc.run_stub(im)
    if mode == "sdxl":
        try:
            return ai_svc.run_sdxl_inpaint(im, prompt)
        except ImportError as exc:
            raise HTTPException(
                status_code=503,
                detail="SDXL dependencies not installed. Use AI_BACKGROUND_MODE=stub or install torch+diffusers.",
            ) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Inpaint failed: {exc}") from exc
    raise HTTPException(
        status_code=500,
        detail=f"Unknown AI_BACKGROUND_MODE={mode!r} (use off, stub, sdxl)",
    )


def _run_on_model_pipeline(im, prompt: str, variant: str) -> tuple[bytes, str]:
    settings = get_settings()
    provider = (settings.ai_on_model_provider or "stub").lower().strip()

    if provider == "stub":
        return on_model_svc.run_on_model_stub(im, variant), "stub"

    if provider == "replicate":
        token = settings.replicate_api_token
        if not token:
            raise HTTPException(
                status_code=503,
                detail="Set REPLICATE_API_TOKEN for AI_ON_MODEL_PROVIDER=replicate",
            )
        try:
            return on_model_svc.run_on_model_replicate(im, prompt, token, variant), "replicate"
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"On-model generation failed: {exc}") from exc

    if provider == "sdxl":
        try:
            return ai_svc.run_sdxl_inpaint(im, prompt), "sdxl"
        except ImportError as exc:
            raise HTTPException(
                status_code=503,
                detail="SDXL dependencies not installed for AI_ON_MODEL_PROVIDER=sdxl.",
            ) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"On-model SDXL failed: {exc}") from exc

    raise HTTPException(
        status_code=500,
        detail=f"Unknown AI_ON_MODEL_PROVIDER={provider!r} (use stub, sdxl, replicate)",
    )


@router.post("")
async def ai_background(
    body: AiBackgroundBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    _rate: Annotated[None, Depends(_ai_limit)] = None,
) -> dict[str, str | None]:
    settings = get_settings()
    mode = (settings.ai_background_mode or "stub").lower().strip()
    if mode == "off":
        raise HTTPException(status_code=503, detail="AI background is disabled (AI_BACKGROUND_MODE=off)")

    billing = assert_ai_image_credit(db, user)

    log_event(
        logger,
        "ai.background.start",
        user_id=user.id,
        sub_mode=body.sub_mode,
        preset_id=body.preset_id,
        model_variant=body.model_variant,
    )

    try:
        im = ai_svc.decode_jewelry_image(body.jewelry_b64)
    except (ValueError, OSError) as exc:
        log_event(logger, "ai.background.invalid_payload", user_id=user.id, error=str(exc))
        raise HTTPException(status_code=400, detail=f"Invalid image payload: {exc}") from exc

    prompt = resolve_prompt(
        sub_mode=body.sub_mode,
        preset_id=body.preset_id,
        model_variant=body.model_variant,
        custom_prompt=body.prompt,
    )

    if body.sub_mode == "model":
        out_bytes, provider_mode = _run_on_model_pipeline(im, prompt, body.model_variant or "hand")
        pipeline_mode = f"model:{provider_mode}"
    else:
        out_bytes = _run_background_pipeline(im, prompt, mode)
        pipeline_mode = f"{body.sub_mode}:{mode}"

    key = ai_svc.save_ai_png(out_bytes, user.id)
    url = public_file_url(key)
    consume_ai_image_credit(db, billing)
    log_event(
        logger,
        "ai.background.done",
        user_id=user.id,
        sub_mode=body.sub_mode,
        mode=pipeline_mode,
        result_key=key,
        bytes=len(out_bytes),
    )
    return {
        "result_key": key,
        "result_url": url,
        "mode": pipeline_mode,
        "sub_mode": body.sub_mode,
        "prompt": prompt,
    }
