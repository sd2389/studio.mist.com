"""Canonical MIST permission codename grammar (ADR-016).

Studio copies this grammar so the product catalog can fail closed without
importing mist-platform. Do not invent a second separator/wildcard scheme.

Shape:

    {product}.{resource}[.{resource}...].{action}
    {product}.admin

Last segment is always the action (except the explicit ``{product}.admin`` form).
No glob / wildcard strings. Exact string match at authorization time.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

PRODUCT_NAMESPACES: frozenset[str] = frozenset(
    {
        "platform",
        "crm",
        "erp",
        "sales",
        "studio",
        "ai",
        "unify",
        "channels",
    }
)

PREFERRED_ACTIONS: frozenset[str] = frozenset(
    {
        "read",
        "write",
        "manage",
        "use",
        "access",
        "act",
        "invite",
        "enable",
        "disable",
        "update",
        "list_all",
        "read_all",
        "disable_global",
    }
)

PRODUCT_ADMIN_ACTION = "admin"

MAX_CODENAME_LENGTH = 128
MAX_SEGMENTS = 5
MIN_NORMAL_SEGMENTS = 3
SEGMENT_PATTERN = r"[a-z][a-z0-9_]*"
_SEGMENT_RE = re.compile(rf"^{SEGMENT_PATTERN}$")
_VERSION_TAIL_RE = re.compile(r"^v\d+$")

_WILDCARD_CHARS = frozenset({"*", "?", "["})


class PermissionNamingError(ValueError):
    """Raised when a permission codename violates ADR-016."""


@dataclass(frozen=True, slots=True)
class ParsedPermission:
    """Structured view of a valid permission codename."""

    product: str
    resource: tuple[str, ...]
    action: str
    codename: str

    @property
    def is_product_admin(self) -> bool:
        return self.action == PRODUCT_ADMIN_ACTION and self.resource == ()


def is_valid_permission_codename(codename: object) -> bool:
    try:
        validate_permission_codename(codename)
    except PermissionNamingError:
        return False
    return True


def parse_permission_codename(codename: object) -> ParsedPermission:
    validate_permission_codename(codename)
    assert isinstance(codename, str)
    parts = codename.split(".")
    if len(parts) == 2 and parts[1] == PRODUCT_ADMIN_ACTION:
        return ParsedPermission(
            product=parts[0],
            resource=(),
            action=PRODUCT_ADMIN_ACTION,
            codename=codename,
        )
    return ParsedPermission(
        product=parts[0],
        resource=tuple(parts[1:-1]),
        action=parts[-1],
        codename=codename,
    )


def validate_permission_codename(codename: object) -> str:
    """Validate and return the codename, or raise PermissionNamingError."""
    if not isinstance(codename, str):
        raise PermissionNamingError("permission codename must be a str")
    if not codename:
        raise PermissionNamingError("permission codename must be non-empty")
    if len(codename) > MAX_CODENAME_LENGTH:
        raise PermissionNamingError(
            f"permission codename exceeds {MAX_CODENAME_LENGTH} characters"
        )
    if codename != codename.strip():
        raise PermissionNamingError("permission codename must not have leading/trailing whitespace")
    if any(ch in codename for ch in _WILDCARD_CHARS) or "**" in codename:
        raise PermissionNamingError("wildcard permission strings are forbidden")
    if ".." in codename or codename.startswith(".") or codename.endswith("."):
        raise PermissionNamingError("permission codename has empty segment")
    if "-" in codename:
        raise PermissionNamingError("use snake_case segments; hyphens are forbidden")
    if any(ch.isupper() for ch in codename):
        raise PermissionNamingError("permission codename must be lowercase")

    parts = codename.split(".")
    if len(parts) < 2:
        raise PermissionNamingError("permission codename needs product and action")
    if len(parts) > MAX_SEGMENTS:
        raise PermissionNamingError(
            f"permission codename has more than {MAX_SEGMENTS} segments"
        )

    for part in parts:
        if not _SEGMENT_RE.match(part):
            raise PermissionNamingError(f"invalid permission segment: {part!r}")
        if _VERSION_TAIL_RE.match(part):
            raise PermissionNamingError(
                "version tails (v1, v2, …) belong to event types, not permissions"
            )

    product = parts[0]
    if product not in PRODUCT_NAMESPACES:
        raise PermissionNamingError(
            f"unknown product namespace {product!r}; "
            f"allowed: {', '.join(sorted(PRODUCT_NAMESPACES))}"
        )

    if len(parts) == 2:
        if parts[1] != PRODUCT_ADMIN_ACTION:
            raise PermissionNamingError(
                "two-segment permissions must be '{product}.admin' only"
            )
        return codename

    if len(parts) < MIN_NORMAL_SEGMENTS:
        raise PermissionNamingError(
            "normal permissions require product.resource.action (3+ segments)"
        )

    if PRODUCT_ADMIN_ACTION in parts[1:]:
        raise PermissionNamingError(
            "'admin' is only valid as '{product}.admin', not as a nested segment"
        )
    return codename
