"""A customer's saved look templates: made from one of their scenes, listed for the bulk upload page,
and picked by a batch, which keeps a copy checked again (docs/adr/0006-bulk-pipeline.md, "Look
templates by slot role"). Each lookup is the caller's own: another's scene or template is 404.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.features.ingest.templates import template_materials, template_of_look, validate_look_template
from app.features.scene.look import saved_look, scene_look
from app.features.scene.service import require_owned_scene
from app.models import LookTemplate, Scene, User
from app.schemas.ingest import LookTemplateOut
from app.schemas.scene import SceneLook
from app.services.model_config import GEM_PRESETS, METAL_PRESETS

_PRESET_LABELS = dict(METAL_PRESETS + GEM_PRESETS)


def owned_template(db: Session, user: User, template_id: int) -> LookTemplate:
    template = db.get(LookTemplate, template_id)
    if template is None or template.user_id != user.id:
        raise HTTPException(status_code=404, detail="Look template not found")
    return template


def batch_template(db: Session, user: User, template_id: int) -> dict[str, Any]:
    """What a batch keeps of the caller's template: checked again, as the catalogue and the
    caller's library may have changed since it was made. 404 for another's template."""
    return validate_look_template(db, owned_template(db, user, template_id).template, user.id)


def _template_name(scene: Scene) -> str:
    title = (scene.name or "").strip() or (scene.sku or "").strip() or f"scene {scene.id}"
    return f"Look of {title}"[:255]


def template_from_scene(db: Session, user: User, scene_id: int) -> tuple[LookTemplate, bool]:
    """The caller's template of their scene's look as it is now, and whether it is new; a scene's
    template made again is brought up to date. 404 for a scene that isn't theirs; 400 naming the
    field when the look can't be a template (a material the catalogue has retired, say)."""
    scene = require_owned_scene(db.get(Scene, scene_id), user.id)
    try:
        template = validate_look_template(db, template_of_look(saved_look(scene)), user.id)
    except HTTPException as exc:
        raise HTTPException(status_code=400, detail=f"This scene's look can't be a template: {exc.detail}") from exc
    row = db.execute(
        select(LookTemplate).where(LookTemplate.user_id == user.id, LookTemplate.source_scene_id == scene.id)
    ).scalars().first()
    now = datetime.utcnow()
    created = row is None
    if row is None:
        row = LookTemplate(user_id=user.id, source_scene_id=scene.id, created_at=now)
        db.add(row)
    row.name = _template_name(scene)
    row.template = template
    row.updated_at = now
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # the same scene's template was made meanwhile: bring that one up to date
        return template_from_scene(db, user, scene_id)
    db.refresh(row)
    return row, created


def list_templates(db: Session, user: User, limit: int) -> list[LookTemplate]:
    """The caller's templates, the latest made or brought up to date first."""
    return list(
        db.execute(
            select(LookTemplate)
            .where(LookTemplate.user_id == user.id)
            .order_by(LookTemplate.updated_at.desc(), LookTemplate.id.desc())
            .limit(limit)
        ).scalars()
    )


def _material_labels(refs: list[str], look: SceneLook) -> dict[str, str]:
    """Each material's name: the catalogue's or the library's, a preset's, else its id in words."""
    named = {f"catalog:{item.slug}": item.label for item in [*look.metals, *look.gems]}
    named |= {f"custom:{item.id}": item.label for item in look.user_materials}
    return {ref: named.get(ref) or _PRESET_LABELS.get(ref) or ref.replace("-", " ").capitalize() for ref in refs}


def template_view(db: Session, template: LookTemplate) -> LookTemplateOut:
    refs = template_materials(template.template)
    look = scene_look(db, {"slot_selections": {ref: ref for ref in refs}}, template.user_id)
    return LookTemplateOut(
        id=template.id,
        name=template.name,
        source_scene_id=template.source_scene_id,
        template=template.template,
        labels=_material_labels(refs, look),
        look=look,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )
