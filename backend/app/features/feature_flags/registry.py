"""Canonical list of product features that can be toggled from admin."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class FeatureDefinition:
    key: str
    label: str
    description: str
    category: str
    default_enabled: bool = True


FEATURE_REGISTRY: tuple[FeatureDefinition, ...] = (
    FeatureDefinition(
        key="upload",
        label="Model upload",
        description="Upload new 3D jewelry models and run slot detection.",
        category="Core",
    ),
    FeatureDefinition(
        key="viewer",
        label="3D viewer & editor",
        description="Open scenes in the studio editor and viewer.",
        category="Core",
    ),
    FeatureDefinition(
        key="variants",
        label="Scene variants",
        description="Create and switch material variants on a model.",
        category="Editor",
    ),
    FeatureDefinition(
        key="batch_export",
        label="Batch export",
        description="Export multiple renders in one batch.",
        category="Editor",
    ),
    FeatureDefinition(
        key="embed",
        label="Embed pages",
        description="Public /embed routes for sharing models.",
        category="Sharing",
    ),
    FeatureDefinition(
        key="ai_background",
        label="AI backgrounds",
        description="Generate AI scene backgrounds from prompts.",
        category="AI",
    ),
    FeatureDefinition(
        key="ai_on_model",
        label="AI on-model shots",
        description="Place jewelry on AI-generated model photos.",
        category="AI",
    ),
    FeatureDefinition(
        key="gallery",
        label="Gallery showcase",
        description="Public gallery pages for sample jewelry.",
        category="Marketing",
    ),
    FeatureDefinition(
        key="stones",
        label="Stone viewer",
        description="Interactive stone cut explorer.",
        category="Marketing",
    ),
    FeatureDefinition(
        key="catalog",
        label="Material catalog",
        description="Browse metals, gems, and scene presets.",
        category="Editor",
    ),
    FeatureDefinition(
        key="library",
        label="User library",
        description="Save custom materials and assets per account.",
        category="Editor",
    ),
    FeatureDefinition(
        key="billing",
        label="Billing & checkout",
        description="Stripe subscriptions, top-ups, and customer portal.",
        category="Billing",
        default_enabled=True,
    ),
    FeatureDefinition(
        key="pricing_page",
        label="Pricing page",
        description="Public /pricing plan comparison page.",
        category="Marketing",
    ),
    FeatureDefinition(
        key="server_exports",
        label="Server exports",
        description="Render exports as jobs on GPU workers instead of in the browser (ADR 0005).",
        category="Editor",
        # Off until the studio's export screens create jobs; while off, creating or quoting one is 404.
        default_enabled=False,
    ),
    FeatureDefinition(
        key="bulk_pipeline",
        label="Bulk pipeline",
        description="Upload batches of CAD files that workers convert into published scenes (ADR 0006).",
        category="Core",
        # Off until the bulk upload page ships; while off, starting or adding to a batch is 404.
        # Reading batches and canceling one stay open, so a batch in flight can be refunded.
        default_enabled=False,
    ),
)

_REGISTRY_BY_KEY = {feature.key: feature for feature in FEATURE_REGISTRY}


def get_definition(key: str) -> FeatureDefinition | None:
    return _REGISTRY_BY_KEY.get(key)
