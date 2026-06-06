"""AI background generation: stub (no GPU) or SDXL inpaint (optional, lazy import)."""

from __future__ import annotations

import base64
import io
import re
from typing import TYPE_CHECKING

from PIL import Image

from app.core import storage
from app.core import storage_keys as keys

if TYPE_CHECKING:
    pass

_DATA_URL = re.compile(r"^data:image/(png|jpeg|jpe|jpg);base64,(.+)$", re.I)


def decode_jewelry_image(jewelry_b64: str) -> Image.Image:
    s = jewelry_b64.strip()
    m = _DATA_URL.match(s)
    if m:
        raw = base64.b64decode(m.group(2), validate=True)
    else:
        raw = base64.b64decode(s, validate=True)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def rgba_to_rgb_on_white(im: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", im.size, (255, 255, 255, 255))
    out = Image.alpha_composite(canvas, im)
    return out.convert("RGB")


def inpaint_mask_from_alpha(im: Image.Image, threshold: int = 128) -> Image.Image:
    """SDXL inpaint: white = region to replace (transparent / background)."""
    alpha = im.split()[3]
    return alpha.point(lambda a: 255 if a < threshold else 0)


def run_stub(im_rgba: Image.Image) -> bytes:
    """No ML — return jewelry composited on white (preview / pipeline check)."""
    rgb = rgba_to_rgb_on_white(im_rgba)
    buf = io.BytesIO()
    rgb.save(buf, format="PNG")
    return buf.getvalue()


_inpaint_pipe = None


def _get_inpaint_pipe():  # pragma: no cover - heavy optional path
    global _inpaint_pipe
    if _inpaint_pipe is not None:
        return _inpaint_pipe
    import torch
    from diffusers import StableDiffusionXLInpaintPipeline

    if not torch.cuda.is_available():
        raise RuntimeError("SDXL inpaint requires CUDA (torch.cuda.is_available).")

    model_id = "diffusers/stable-diffusion-xl-1.0-inpainting-0.1"
    pipe = StableDiffusionXLInpaintPipeline.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        variant="fp16",
    )
    pipe.enable_model_cpu_offload()
    _inpaint_pipe = pipe
    return _inpaint_pipe


def run_sdxl_inpaint(im_rgba: Image.Image, prompt: str) -> bytes:
    pipe = _get_inpaint_pipe()
    image = rgba_to_rgb_on_white(im_rgba)
    mask_image = inpaint_mask_from_alpha(im_rgba)
    result = pipe(
        prompt=prompt,
        image=image,
        mask_image=mask_image,
        guidance_scale=7.5,
        num_inference_steps=28,
    ).images[0]
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()


def save_ai_png(data: bytes, user_id: int) -> str:
    key = keys.ai_render_key(user_id, "png")
    storage.write_bytes(key, data, content_type="image/png")
    return key
