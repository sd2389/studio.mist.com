"""Studio permission namespace — ADR-016 catalog, allow + deny."""

from __future__ import annotations

import pytest

from app.core.permission_naming import (
    PermissionNamingError,
    is_valid_permission_codename,
    parse_permission_codename,
    validate_permission_codename,
)
from app.core.permissions import (
    PRODUCT_SLUG,
    STUDIO_ADMIN,
    STUDIO_ASSET_WRITE,
    STUDIO_PERMISSIONS,
    STUDIO_PROJECT_READ,
    STUDIO_ROLE_PERMISSIONS,
    STUDIO_STAFF_ACCESS,
    PermissionDenied,
    has_permission,
    is_studio_permission,
    require_permission,
    studio_permissions_from,
)

ADR016_STUDIO_EXAMPLES = (
    "studio.project.read",
    "studio.asset.write",
)

INVALID_CODENAMES = (
    "*",
    "studio.*",
    "*.read",
    "project.read",
    "STUDIO.project.read",
    "studio.project.read-write",
    "studio..project.read",
    "studio",
    "studio.project",
    "studio.admin.read",
    "studio.project.disabled.v1",
    "unknown.resource.read",
    "",
    None,
    123,
)


@pytest.mark.parametrize("codename", sorted(STUDIO_PERMISSIONS))
def test_catalog_entries_match_adr016_and_studio_product(codename):
    parsed = parse_permission_codename(codename)
    assert parsed.product == PRODUCT_SLUG
    assert parsed.codename == codename
    assert is_studio_permission(codename)


@pytest.mark.parametrize("codename", ADR016_STUDIO_EXAMPLES)
def test_adr016_illustrative_studio_names_are_in_catalog(codename):
    assert codename in STUDIO_PERMISSIONS
    validate_permission_codename(codename)


@pytest.mark.parametrize("codename", INVALID_CODENAMES)
def test_invalid_codenames_are_rejected(codename):
    with pytest.raises(PermissionNamingError):
        validate_permission_codename(codename)
    assert is_valid_permission_codename(codename) is False
    assert is_studio_permission(codename) is False


def test_studio_admin_is_explicit_capability_not_nested_action():
    parsed = parse_permission_codename(STUDIO_ADMIN)
    assert parsed.is_product_admin is True
    assert parsed.resource == ()


def test_roles_only_grant_catalog_permissions_and_require_staff_access():
    assert set(STUDIO_ROLE_PERMISSIONS) == {
        "studio-viewer",
        "studio-editor",
        "studio-admin",
    }
    for slug, granted in STUDIO_ROLE_PERMISSIONS.items():
        assert granted <= STUDIO_PERMISSIONS, slug
        assert STUDIO_STAFF_ACCESS in granted
    assert STUDIO_ROLE_PERMISSIONS["studio-admin"] == STUDIO_PERMISSIONS
    assert STUDIO_ADMIN not in STUDIO_ROLE_PERMISSIONS["studio-viewer"]
    assert STUDIO_ADMIN not in STUDIO_ROLE_PERMISSIONS["studio-editor"]
    assert STUDIO_ASSET_WRITE not in STUDIO_ROLE_PERMISSIONS["studio-viewer"]
    assert STUDIO_ASSET_WRITE in STUDIO_ROLE_PERMISSIONS["studio-editor"]


def test_allow_exact_catalog_membership():
    granted = {STUDIO_STAFF_ACCESS, STUDIO_PROJECT_READ}
    assert has_permission(granted, STUDIO_PROJECT_READ) is True
    require_permission(granted, STUDIO_PROJECT_READ)


def test_deny_missing_permission():
    granted = {STUDIO_STAFF_ACCESS}
    assert has_permission(granted, STUDIO_PROJECT_READ) is False
    with pytest.raises(PermissionDenied) as exc_info:
        require_permission(granted, STUDIO_PROJECT_READ)
    assert str(exc_info.value) == "Permission required."
    assert exc_info.value.required == STUDIO_PROJECT_READ


def test_deny_admin_does_not_expand_to_resource_permissions():
    granted = {STUDIO_ADMIN, STUDIO_STAFF_ACCESS}
    assert has_permission(granted, STUDIO_ADMIN) is True
    assert has_permission(granted, STUDIO_PROJECT_READ) is False


def test_deny_foreign_product_and_wildcard_grants():
    granted = ["crm.deals.read", "studio.*", "*", STUDIO_PROJECT_READ]
    filtered = studio_permissions_from(granted)
    assert filtered == frozenset({STUDIO_PROJECT_READ})
    assert has_permission(granted, STUDIO_PROJECT_READ) is True
    assert has_permission(["crm.deals.read"], STUDIO_PROJECT_READ) is False
    assert has_permission(["studio.*", "*"], STUDIO_PROJECT_READ) is False


def test_deny_unknown_required_and_unlisted_studio_codes():
    assert has_permission({STUDIO_PROJECT_READ}, "studio.foo.read") is False
    assert has_permission({"studio.foo.read"}, STUDIO_PROJECT_READ) is False
    assert "studio.foo.read" not in studio_permissions_from({"studio.foo.read"})


def test_filter_fail_closed_on_bare_string_and_non_iterable():
    assert studio_permissions_from(STUDIO_PROJECT_READ) == frozenset()
    assert studio_permissions_from(None) == frozenset()
    assert studio_permissions_from(123) == frozenset()
    assert has_permission(STUDIO_PROJECT_READ, STUDIO_PROJECT_READ) is False
    assert has_permission(None, STUDIO_STAFF_ACCESS) is False
