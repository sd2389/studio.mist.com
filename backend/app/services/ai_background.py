"""AI background generation: stub (no GPU) or SDXL inpaint (optional, lazy import)."""

from __future__ import annotations

import base64
import io
import re
import uuid
from typing import TYPE_CHECKING

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from PIL import Image

from app.config import get_settings

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


def save_ai_png(data: bytes) -> str:
    settings = get_settings()
    key = f"ai-renders/{uuid.uuid4().hex}.png"
    if settings.aws_bucket:
        try:
            client = boto3.client("s3", region_name=settings.aws_region or "us-east-1")
            client.put_object(
                Bucket=settings.aws_bucket,
                Key=key,
                Body=data,
                ContentType="image/png",
            )
        except (BotoCoreError, ClientError) as exc:
            raise RuntimeError(f"S3 upload failed: {exc}") from exc
    else:
        dest = settings.upload_dir / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
    return key


def public_file_url(key: str) -> str | None:
    settings = get_settings()
    if not settings.public_api_base:
        return None
    return f"{settings.public_api_base.rstrip('/')}/files/{key}"
