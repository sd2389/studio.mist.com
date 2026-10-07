"""A scene's thumbnail set from the studio's live view (ADR 0005, "Download PNG and Capture still"),
or from a batch design's still (ADR 0006, "Render plans").

The studio sends a capture of its live viewer, no bigger than a screenshot. It is not a render:
it costs no credit and carries no mark, since it is the piece's public product thumbnail. The
API judges it by its bytes, keeps it as WebP under the owner's thumbnails, where it counts toward
storage as an upload's thumbnail does, and publishes it with the scene. A batch design's scene
takes a 512 px copy of its plan's still the same way once its angle set completes.
"""

from __future__ import annotations

from datetime import datetime
from io import BytesIO

from fastapi import HTTPException
from PIL import Image
from sqlalchemy.orm import Session

from app.core import storage
from app.core import storage_keys as keys
from app.features.billing.quota_service import count_storage_bytes, get_or_create_billing, release_storage_bytes
from app.features.publish import service as publish_service
from app.features.scene.deletion import keys_used_elsewhere, uploaded_thumbnail
from app.features.scene.service import require_owned_scene, scene_list_item
from app.models import Scene
from app.models.user import User
from app.schemas.scene import SceneListItem
from app.services.image_files import ImageRejectedError, WrongImageKindError, check_image

THUMBNAIL_KINDS = frozenset({"png", "jpeg", "webp"})
MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024
# The studio captures the live view at no more than this on its longest side.
MAX_THUMBNAIL_SIDE = 1024
WEBP_QUALITY = 88
_HAS_ALPHA = frozenset({"RGBA", "LA", "PA"})
# A render job's stills: PNG or JPEG, at most a job's longest side and largest frame.
STILL_KINDS = frozenset({"png", "jpeg"})
MAX_STILL_SIDE = 8192
MAX_STILL_PIXELS = 36_000_000
STILL_THUMBNAIL_SIDE = 512


def webp_thumbnail(data: bytes) -> bytes:
    """The capture as the WebP the scene keeps, judged by its bytes: 400 when it is empty, 415 for
    anything but a PNG, JPEG or WebP, 422 for one that can't be read or is over 1024 px a side.

    Re-encoding keeps only the pixels, so nothing else the file carried reaches the public copy.
    """
    if not data:
        raise HTTPException(status_code=400, detail="The thumbnail is empty.")
    try:
        checked = check_image(
            data,
            kinds=THUMBNAIL_KINDS,
            max_side=MAX_THUMBNAIL_SIDE,
            max_pixels=MAX_THUMBNAIL_SIDE * MAX_THUMBNAIL_SIDE,
        )
    except WrongImageKindError as exc:
        raise HTTPException(status_code=415, detail="A thumbnail must be a PNG, JPEG or WebP image.") from exc
    except ImageRejectedError as exc:
        raise HTTPException(status_code=422, detail=f"This thumbnail can't be used: {exc}.") from exc
    out = BytesIO()
    try:
        with Image.open(BytesIO(data), formats=[checked.kind.upper()]) as image:
            has_alpha = image.mode in _HAS_ALPHA or "transparency" in image.info
            image.convert("RGBA" if has_alpha else "RGB").save(out, format="WEBP", quality=WEBP_QUALITY)
    except (OSError, ValueError) as exc:
        detail = "This thumbnail can't be used: its pixels can't be converted."
        raise HTTPException(status_code=422, detail=detail) from exc
    return out.getvalue()


def thumbnail_from_still(data: bytes) -> bytes:
    """A render job's still as the 512 px WebP a batch design's scene keeps (ADR 0006, "Render
    plans"): judged by its bytes as a PNG or JPEG of at most a job's size, then scaled down and
    re-encoded, so only its pixels reach the public copy."""
    try:
        checked = check_image(data, kinds=STILL_KINDS, max_side=MAX_STILL_SIDE, max_pixels=MAX_STILL_PIXELS)
    except ImageRejectedError as exc:
        raise ValueError(f"the still can't be used: {exc}") from exc
    out = BytesIO()
    with Image.open(BytesIO(data), formats=[checked.kind.upper()]) as image:
        image.draft("RGB", (STILL_THUMBNAIL_SIDE, STILL_THUMBNAIL_SIDE))  # a JPEG decodes at the scale it needs
        has_alpha = image.mode in _HAS_ALPHA or "transparency" in image.info
        small = image.convert("RGBA" if has_alpha else "RGB")
        small.thumbnail((STILL_THUMBNAIL_SIDE, STILL_THUMBNAIL_SIDE), Image.Resampling.LANCZOS)
        small.save(out, format="WEBP", quality=WEBP_QUALITY)
    return out.getvalue()


def set_scene_thumbnail(db: Session, scene_id: int, user: User, data: bytes) -> SceneListItem:
    """Make the capture the owner's scene's thumbnail; 404 for anyone else's scene."""
    scene = require_owned_scene(db.get(Scene, scene_id), user.id)
    replace_scene_thumbnail(db, scene, user, webp_thumbnail(data))
    return scene_list_item(db, scene)


def replace_scene_thumbnail(db: Session, scene: Scene, user: User, image: bytes) -> None:
    """Make `image`, a WebP, the scene's thumbnail.

    The thumbnail it replaces goes the way a render replacing it would send it
    (`save_render_from_data_url`): an upload's thumbnail, which counted toward storage, gives its
    bytes back and its file is deleted once this commits; a render stays a render. The new one
    counts in its place, so replacing a thumbnail never needs more room than the difference (402
    when there isn't that). The scene's public copy follows it.
    """
    billing = get_or_create_billing(db, user)
    published_before = publish_service.published_inputs(scene)
    replaced = uploaded_thumbnail(db, scene)
    key = keys.thumbnail_key(user.id)
    storage.write_bytes(key, image, content_type="image/webp")
    try:
        if replaced is not None:
            release_storage_bytes(db, billing, storage.object_size(replaced) or 0)
        count_storage_bytes(db, user.id, len(image))
        scene.thumbnail_key = key
        scene.updated_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()
        storage.delete_quietly(key)
        raise
    db.refresh(scene)
    if replaced is not None and replaced not in keys_used_elsewhere(db, scene.id, [replaced]):
        storage.delete_quietly(replaced)
    publish_service.republish_if_changed(db, scene, published_before)
