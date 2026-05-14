from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.schemas.ai import AiBackgroundBody
from app.services import ai_background as ai_svc

router = APIRouter()


@router.post("")
async def ai_background(body: AiBackgroundBody) -> dict[str, str | None]:
    settings = get_settings()
    mode = (settings.ai_background_mode or "stub").lower().strip()
    if mode == "off":
        raise HTTPException(status_code=503, detail="AI background is disabled (AI_BACKGROUND_MODE=off)")

    try:
        im = ai_svc.decode_jewelry_image(body.jewelry_b64)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image payload: {exc}") from exc

    default_prompt = (
        "luxury jewelry catalog photo, macro shot, studio lighting, sharp gem focus, neutral background"
    )
    prompt = (body.prompt or default_prompt).strip()

    if mode == "stub":
        out_bytes = ai_svc.run_stub(im)
    elif mode == "sdxl":
        try:
            out_bytes = ai_svc.run_sdxl_inpaint(im, prompt)
        except ImportError as exc:
            raise HTTPException(
                status_code=503,
                detail="SDXL dependencies not installed. Use AI_BACKGROUND_MODE=stub or install torch+diffusers.",
            ) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Inpaint failed: {exc}") from exc
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Unknown AI_BACKGROUND_MODE={mode!r} (use off, stub, sdxl)",
        )

    try:
        key = ai_svc.save_ai_png(out_bytes)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    url = ai_svc.public_file_url(key)
    return {"result_key": key, "result_url": url, "mode": mode}
