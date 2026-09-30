"""Studio permission namespace (Wave 0).

MIST Platform owns persistence/seeding of Permission rows
(``w0-platform-studio-perms-pending``). Studio owns the catalog contract:

- product slug ``studio`` (ADR-015 audience / application registry)
- ADR-016 grammar only; no wildcards
- exact-string membership (ADR-003); ``studio.admin`` does not expand

Do not wire this catalog onto HTTP routes here — that is ``w4-studio-protect-apis``.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.core.permission_naming import (
    PermissionNamingError,
    parse_permission_codename,
)

PRODUCT_SLUG = "studio"

STUDIO_STAFF_ACCESS = "studio.staff.access"
STUDIO_PROJECT_READ = "studio.project.read"
STUDIO_PROJECT_WRITE = "studio.project.write"
STUDIO_ASSET_READ = "studio.asset.read"
STUDIO_ASSET_WRITE = "studio.asset.write"
STUDIO_SCENE_READ = "studio.scene.read"
STUDIO_SCENE_WRITE = "studio.scene.write"
STUDIO_MATERIAL_READ = "studio.material.read"
STUDIO_MATERIAL_WRITE = "studio.material.write"
STUDIO_RENDER_READ = "studio.render.read"
STUDIO_RENDER_WRITE = "studio.render.write"
STUDIO_BILLING_READ = "studio.billing.read"
STUDIO_BILLING_MANAGE = "studio.billing.manage"
STUDIO_CATALOG_READ = "studio.catalog.read"
STUDIO_CATALOG_WRITE = "studio.catalog.write"
STUDIO_SETTINGS_READ = "studio.settings.read"
STUDIO_SETTINGS_WRITE = "studio.settings.write"
STUDIO_AI_USE = "studio.ai.use"
STUDIO_ADMIN = "studio.admin"

STUDIO_PERMISSIONS: frozenset[str] = frozenset(
    {
        STUDIO_STAFF_ACCESS,
        STUDIO_PROJECT_READ,
        STUDIO_PROJECT_WRITE,
        STUDIO_ASSET_READ,
        STUDIO_ASSET_WRITE,
        STUDIO_SCENE_READ,
        STUDIO_SCENE_WRITE,
        STUDIO_MATERIAL_READ,
        STUDIO_MATERIAL_WRITE,
        STUDIO_RENDER_READ,
        STUDIO_RENDER_WRITE,
        STUDIO_BILLING_READ,
        STUDIO_BILLING_MANAGE,
        STUDIO_CATALOG_READ,
        STUDIO_CATALOG_WRITE,
        STUDIO_SETTINGS_READ,
        STUDIO_SETTINGS_WRITE,
        STUDIO_AI_USE,
        STUDIO_ADMIN,
    }
)

_STUDIO_VIEWER = frozenset(
    {
        STUDIO_STAFF_ACCESS,
        STUDIO_PROJECT_READ,
        STUDIO_ASSET_READ,
        STUDIO_SCENE_READ,
        STUDIO_MATERIAL_READ,
        STUDIO_RENDER_READ,
        STUDIO_BILLING_READ,
        STUDIO_CATALOG_READ,
    }
)

_STUDIO_EDITOR = _STUDIO_VIEWER | frozenset(
    {
        STUDIO_PROJECT_WRITE,
        STUDIO_ASSET_WRITE,
        STUDIO_SCENE_WRITE,
        STUDIO_MATERIAL_WRITE,
        STUDIO_RENDER_WRITE,
        STUDIO_AI_USE,
    }
)

STUDIO_ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    "studio-viewer": _STUDIO_VIEWER,
    "studio-editor": _STUDIO_EDITOR,
    "studio-admin": STUDIO_PERMISSIONS,
}


class PermissionDenied(Exception):
    """Fail-closed miss. Transport maps this to HTTP 403 without leaking internals."""

    def __init__(self, required: str):
        self.required = required
        super().__init__("Permission required.")


def _assert_studio_catalog() -> None:
    for codename in STUDIO_PERMISSIONS:
        parsed = parse_permission_codename(codename)
        if parsed.product != PRODUCT_SLUG:
            raise PermissionNamingError(
                f"Studio catalog entry must use product {PRODUCT_SLUG!r}: {codename}"
            )
    for role_slug, codenames in STUDIO_ROLE_PERMISSIONS.items():
        extra = codenames - STUDIO_PERMISSIONS
        if extra:
            raise PermissionNamingError(
                f"role {role_slug} grants unknown Studio permissions: {sorted(extra)}"
            )


_assert_studio_catalog()


def studio_permissions_from(granted: object) -> frozenset[str]:
    """Return the known Studio permissions in ``granted``. Fail closed on junk."""
    if isinstance(granted, (str, bytes)) or not isinstance(granted, Iterable):
        return frozenset()
    allowed: set[str] = set()
    for item in granted:
        if item in STUDIO_PERMISSIONS:
            allowed.add(item)
    return frozenset(allowed)


def has_permission(granted: object, required: str) -> bool:
    """Exact membership. Unknown required names and ``studio.admin`` do not expand."""
    if required not in STUDIO_PERMISSIONS:
        return False
    return required in studio_permissions_from(granted)


def require_permission(granted: object, required: str) -> None:
    if not has_permission(granted, required):
        raise PermissionDenied(required)


def is_studio_permission(codename: object) -> bool:
    try:
        parsed = parse_permission_codename(codename)
    except PermissionNamingError:
        return False
    return parsed.product == PRODUCT_SLUG
