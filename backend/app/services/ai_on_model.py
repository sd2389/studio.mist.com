"""On-model AI compositing — stub (PIL) and optional Replicate hosted provider."""

from __future__ import annotations

import base64
import io
import json
import time
import urllib.error
import urllib.request
from typing import TYPE_CHECKING

from PIL import Image, ImageDraw, ImageFilter

from app.services.ai_presets import AiModelVariant

if TYPE_CHECKING:
    pass

_SKIN_TOP = (232, 196, 176)
_SKIN_BOTTOM = (196, 150, 128)


def _skin_gradient(size: tuple[int, int]) -> Image.Image:
    w, h = size
    canvas = Image.new("RGB", size, _SKIN_TOP)
    draw = ImageDraw.Draw(canvas)
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(_SKIN_TOP[0] * (1 - t) + _SKIN_BOTTOM[0] * t)
        g = int(_SKIN_TOP[1] * (1 - t) + _SKIN_BOTTOM[1] * t)
        b = int(_SKIN_TOP[2] * (1 - t) + _SKIN_BOTTOM[2] * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return canvas.filter(ImageFilter.GaussianBlur(radius=2))


def _placement_for_variant(
    variant: AiModelVariant,
    canvas_w: int,
    canvas_h: int,
    jewel_w: int,
    jewel_h: int,
) -> tuple[int, int, float]:
    if variant == "hand":
        scale = min(canvas_w * 0.42 / jewel_w, canvas_h * 0.38 / jewel_h)
        x = int(canvas_w * 0.5 - (jewel_w * scale) / 2)
        y = int(canvas_h * 0.52 - (jewel_h * scale) / 2)
        return x, y, scale
    if variant == "neck":
        scale = min(canvas_w * 0.55 / jewel_w, canvas_h * 0.35 / jewel_h)
        x = int(canvas_w * 0.5 - (jewel_w * scale) / 2)
        y = int(canvas_h * 0.38 - (jewel_h * scale) / 2)
        return x, y, scale
    # ear
    scale = min(canvas_w * 0.5 / jewel_w, canvas_h * 0.45 / jewel_h)
    x = int(canvas_w * 0.58 - (jewel_w * scale) / 2)
    y = int(canvas_h * 0.42 - (jewel_h * scale) / 2)
    return x, y, scale


def run_on_model_stub(im_rgba: Image.Image, variant: AiModelVariant) -> bytes:
    """Composite jewelry cutout onto a skin-tone placeholder (no external API)."""
    size = im_rgba.size
    base = _skin_gradient(size).convert("RGBA")
    jewel = im_rgba.copy()
    x, y, scale = _placement_for_variant(variant, size[0], size[1], jewel.width, jewel.height)
    if scale != 1:
        jewel = jewel.resize(
            (max(1, int(jewel.width * scale)), max(1, int(jewel.height * scale))),
            Image.Resampling.LANCZOS,
        )
    base.alpha_composite(jewel, (x, y))
    out = Image.new("RGB", size, (255, 255, 255))
    out.paste(base, mask=base.split()[3])
    buf = io.BytesIO()
    out.save(buf, format="PNG")
    return buf.getvalue()


def _replicate_post(token: str, path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.replicate.com/v1{path}",
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _replicate_poll(token: str, prediction_id: str, timeout_s: float = 180) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        req = urllib.request.Request(
            f"https://api.replicate.com/v1/predictions/{prediction_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        status = body.get("status")
        if status in ("succeeded", "failed", "canceled"):
            return body
        time.sleep(2)
    raise RuntimeError("Replicate prediction timed out")


def _image_to_data_uri(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.convert("RGB").save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def run_on_model_replicate(
    im_rgba: Image.Image,
    prompt: str,
    token: str,
    variant: AiModelVariant,
) -> bytes:
    """
    Hosted on-model path via Replicate SDXL inpainting.
    Uses jewelry cutout + full-frame mask (same inpaint contract as local SDXL).
    """
    from app.services.ai_background import inpaint_mask_from_alpha, rgba_to_rgb_on_white, run_sdxl_inpaint

    # Prefer local SDXL when CUDA is available — same prompt, no network round-trip.
    try:
        return run_sdxl_inpaint(im_rgba, prompt)
    except RuntimeError:
        pass

    image_uri = _image_to_data_uri(rgba_to_rgb_on_white(im_rgba))
    mask_im = inpaint_mask_from_alpha(im_rgba)
    mask_buf = io.BytesIO()
    mask_im.save(mask_buf, format="PNG")
    mask_uri = f"data:image/png;base64,{base64.b64encode(mask_buf.getvalue()).decode('ascii')}"

    payload = {
        "input": {
            "image": image_uri,
            "mask": mask_uri,
            "prompt": f"{prompt}, {variant} placement, photorealistic",
            "negative_prompt": "blurry, low quality, deformed jewelry",
            "num_inference_steps": 28,
        },
    }

    try:
        result = _replicate_post(
            token,
            "/models/stability-ai/stable-diffusion-xl-inpainting/predictions",
            payload,
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Replicate request failed ({exc.code}): {detail}") from exc

    if result.get("status") != "succeeded":
        result = _replicate_poll(token, result["id"])

    if result.get("status") != "succeeded":
        raise RuntimeError(result.get("error") or "Replicate prediction failed")

    output = result.get("output")
    if not output:
        raise RuntimeError("Replicate returned no output")

    image_url = output[0] if isinstance(output, list) else output
    with urllib.request.urlopen(image_url, timeout=60) as resp:
        return resp.read()
