"""The Campaign Pack as a render job (docs/adr/0005-server-exports.md, D1): its config checked
strictly, as the dialog sends it; Grow and Studio only, its turntables and spins within the plan's
caps; priced as the sum of its parts plus the ASET image; one ZIP."""

import dataclasses
from typing import get_args

import pytest
from fastapi import HTTPException
from pack_samples import DEFAULT_PACK, pack

from app.features.billing.plans import PLAN_QUOTAS
from app.features.render_jobs.campaign_pack import PACK_METALS, PACK_VIDEO_SIZES, PackPart, PackVideoFormat
from app.features.render_jobs.job_files import (
    PlannedOutput,
    frame_size,
    longest_edge,
    normalised_spec,
    output_names,
    planned_outputs,
)
from app.features.render_jobs.plan_limits import plan_refusal
from app.features.render_jobs.pricing import render_job_cost
from app.features.render_jobs.specs import check_poses, parse_spec

HERO = {"id": "pose-hero", "name": "Hero", "cameraPosition": [1, 1, 1], "target": [0, 0, 0]}


def _parse(config: dict):
    return parse_spec("campaign_pack", config)


def _refused(config: dict) -> str:
    with pytest.raises(HTTPException) as exc:
        _parse(config)
    assert exc.value.status_code == 400
    return exc.value.detail


def _without(field: str) -> dict:
    return {key: value for key, value in DEFAULT_PACK.items() if key != field}


# ---------------------------------------------------------------------------
# The config
# ---------------------------------------------------------------------------


def test_the_default_pack_is_kept_whole_with_every_frame_it_renders():
    spec = _parse(DEFAULT_PACK)

    assert normalised_spec(spec, ["RING-1_campaign-pack.zip"]) == {
        **DEFAULT_PACK,
        # 24 stills, the ASET image, 3 spins of 72 frames and 6 turntables of 300.
        "frames": 24 + 1 + 3 * 72 + 6 * 300,
        "output_names": ["RING-1_campaign-pack.zip"],
    }


def test_the_default_pack_renders_what_the_browsers_plan_does():
    """planCampaignPack: a still per metal, angle and format; one ASET image; a spin and a
    turntable per format for every metal."""
    parts = _parse(DEFAULT_PACK).parts()

    assert parts.count(PackPart("still", 2000, 2000)) == 3 * 4 * 2
    assert parts.count(PackPart("scope", 2000, 2000)) == 1
    assert parts.count(PackPart("spin", 1080, 1080, frames=72)) == 3
    assert parts.count(PackPart("turntable", 1920, 1080, frames=300, fps=30)) == 3
    assert parts.count(PackPart("turntable", 1080, 1080, frames=300, fps=30)) == 3
    assert len(parts) == 24 + 1 + 3 + 6


@pytest.mark.parametrize(
    "changes",
    [
        {"metals": ["current", "platinum"]},
        {"metals": sorted(PACK_METALS - {"current"})[:8]},
        {"angleIds": ["side", "pose:pose-hero"]},
        {"background": {"kind": "scene"}},
        {"background": {"kind": "custom", "color": "#F4F2EE"}},
        {"jpegQuality": 1, "marginPct": 0, "stillSize": 4000},
        {"turntable": {"formats": [], "durationSec": 60, "fps": 60}},
        {"spin": {"frames": 144, "size": 2048}},
        {"angleIds": [], "turntable": {"enabled": False}, "spin": {"enabled": False}},  # the ASET image alone
    ],
)
def test_what_a_pack_may_ask_for(changes):
    _parse(pack(**changes))


@pytest.mark.parametrize(
    ("config", "field"),
    [
        (pack(metals=[]), "spec.metals"),
        (pack(metals=["gold-99k"]), "spec.metals[0]"),
        (pack(metals=["platinum", "platinum"]), "spec.metals"),
        (pack(metals=sorted(PACK_METALS)[:9]), "spec.metals"),
        (pack(angleIds=["diagonal"]), "spec.angleIds[0]"),
        (pack(angleIds=["front", "pose:"]), "spec.angleIds[1]"),
        (pack(angleIds=["pose:../etc"]), "spec.angleIds[0]"),
        (pack(angleIds=["front", "front"]), "spec.angleIds"),
        (pack(angleIds=[f"pose:saved-{n}" for n in range(9)]), "spec.angleIds"),
        (pack(stillSize=2500), "spec.stillSize"),
        (pack(stillSize="2000"), "spec.stillSize"),
        (pack(stillSize=2000.0), "spec.stillSize"),
        (pack(formats={"webp": True}), "spec.formats.webp"),
        (pack(jpegQuality=0.5), "spec.jpegQuality"),
        (pack(marginPct=25), "spec.marginPct"),
        (pack(background={"kind": "custom"}), "spec.background"),
        (pack(background={"color": "#ffffff"}), "spec.background"),
        (pack(background={"kind": "custom", "color": "url(x)"}), "spec.background.color"),
        (pack(background={"kind": "custom", "color": "red"}), "spec.background.color"),
        (pack(background={"kind": "gradient"}), "spec.background.kind"),
        (pack(turntable={"formats": ["portrait"]}), "spec.turntable.formats[0]"),
        (pack(turntable={"formats": ["square", "square"]}), "spec.turntable.formats"),
        (pack(turntable={"fps": 0}), "spec.turntable.fps"),
        (pack(turntable={"fps": 61}), "spec.turntable.fps"),
        (pack(turntable={"durationSec": 0}), "spec.turntable.durationSec"),
        (pack(turntable={"durationSec": 10.5}), "spec.turntable.durationSec"),
        (pack(turntable={"durationSec": 121}), "spec.turntable"),  # 3,630 frames at 30 fps
        (pack(spin={"frames": 145}), "spec.spin.frames"),
        (pack(spin={"size": 4096}), "spec.spin.size"),
        (pack(spin={"enabled": "yes"}), "spec.spin.enabled"),
        (pack(embed=1), "spec.embed"),
        (pack(quality="high"), "spec.quality"),
        (_without("cutScope"), "spec.cutScope"),
        (pack(angleIds=[], turntable={"enabled": False}, spin={"enabled": False}, cutScope=False), "spec"),
        (
            pack(formats={"jpg": False, "png": False}, turntable={"formats": []}, spin={"enabled": False}, cutScope=False),
            "spec",
        ),
    ],
)
def test_a_bad_pack_is_refused_naming_the_field(config, field):
    assert _refused(config).startswith(f"{field}:")


def test_a_pack_with_nothing_to_render_says_what_to_pick():
    config = pack(angleIds=[], turntable={"enabled": False}, spin={"enabled": False}, cutScope=False)

    assert _refused(config) == "spec: pick at least one angle, turntable format, the 360° spin or the ASET image"


def test_a_packs_pose_angle_is_a_pose_the_user_saved():
    """The dialog offers the poses the user saved; the built-in poses are the pack's own angles."""
    spec = _parse(pack(angleIds=["front", "pose:pose-hero"]))

    check_poses(spec, [HERO])
    for saved in ([], [{**HERO, "isDefault": True}]):
        with pytest.raises(HTTPException) as exc:
            check_poses(spec, saved)
        assert exc.value.detail == "spec.angleIds[1]: the look has no saved pose 'pose-hero'"
    with pytest.raises(HTTPException):
        check_poses(_parse(pack(angleIds=["pose:pose-top"])), [{"id": "pose-top", "name": "Top"}])


def test_every_video_format_and_metal_is_the_packs():
    assert set(get_args(PackVideoFormat)) == set(PACK_VIDEO_SIZES)
    assert len(PACK_METALS) == 22  # the 21 presets of PACK_METAL_OPTIONS and "current"
    assert {"gold-18k-yellow", "rhodium-black", "gold-red-light", "current"} <= PACK_METALS


# ---------------------------------------------------------------------------
# The price
# ---------------------------------------------------------------------------


def test_the_default_pack_costs_49():
    """24 images at 2000², six 10 s turntables at 1080p and 1080², three 72-frame spins at
    1080², and the ASET image (ADR 0005, "Credits")."""
    assert render_job_cost("campaign_pack", _parse(DEFAULT_PACK)) == 24 + 18 + 6 + 1 == 49


@pytest.mark.parametrize(
    ("changes", "credits"),
    [
        ({"cutScope": False}, 48),
        ({"formats": {"png": False}}, 12 + 18 + 6 + 1),
        ({"angleIds": []}, 18 + 6 + 1),
        ({"metals": ["platinum"]}, 8 + 6 + 2 + 1),
        ({"stillSize": 1000}, 49),
        ({"stillSize": 3000}, 24 * 2 + 18 + 6 + 1),
        ({"stillSize": 4000}, 24 * 3 + 18 + 6 + 1),
        ({"turntable": {"fps": 60}}, 24 + 18 * 2 + 6 + 1),  # double above 30 fps
        ({"turntable": {"durationSec": 11}}, 24 + 18 * 2 + 6 + 1),  # two started 10 s each
        ({"turntable": {"formats": ["landscape", "square", "vertical"]}}, 24 + 27 + 6 + 1),
        ({"turntable": {"enabled": False}}, 24 + 6 + 1),
        ({"spin": {"frames": 144, "size": 2048}}, 24 + 18 + 3 * 8 + 1),
        ({"spin": {"enabled": False}}, 24 + 18 + 1),
    ],
)
def test_a_pack_costs_the_sum_of_its_parts_and_the_aset_image(changes, credits):
    assert render_job_cost("campaign_pack", _parse(pack(**changes))) == credits


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------


def test_a_pack_is_part_of_grow_and_studio():
    spec = _parse(DEFAULT_PACK)

    assert plan_refusal("free", spec) == "The Campaign Pack is part of Grow and Studio, not Free."
    assert plan_refusal("grow", spec) is None
    assert plan_refusal("studio", spec) is None


def test_a_packs_turntables_keep_the_plans_length():
    assert plan_refusal("grow", _parse(pack(turntable={"durationSec": 60, "fps": 60}))) is None
    assert plan_refusal("grow", _parse(pack(turntable={"durationSec": 61}))) == (
        "Video length limit exceeded for Grow (max 60 s)."
    )
    # Off, a pack's turntables render nothing to cap.
    assert plan_refusal("grow", _parse(pack(turntable={"enabled": False, "durationSec": 61}))) is None


def test_a_packs_spins_and_frame_rates_keep_the_plans_caps(monkeypatch):
    smaller = dataclasses.replace(PLAN_QUOTAS["grow"], max_spin_frames=36, max_spin_size=1024, max_video_fps=24)
    monkeypatch.setitem(PLAN_QUOTAS, "grow", smaller)

    assert plan_refusal("grow", _parse(pack(turntable={"fps": 24}, spin={"size": 1024, "frames": 36}))) is None
    assert plan_refusal("grow", _parse(pack(turntable={"fps": 24}))) == (
        "Spin frame limit exceeded for Grow (max 36 frames)."
    )
    assert plan_refusal("grow", _parse(pack(turntable={"fps": 24}, spin={"size": 2048, "frames": 36}))) == (
        "Spin size limit exceeded for Grow (max 1024 px)."
    )
    assert plan_refusal("grow", _parse(pack(spin={"size": 1024, "frames": 36}))) == (
        "Frame rate limit exceeded for Grow (max 24 fps)."
    )


# ---------------------------------------------------------------------------
# What it makes
# ---------------------------------------------------------------------------


def test_a_pack_makes_one_zip_named_as_the_browser_names_it():
    spec = _parse(DEFAULT_PACK)
    names = output_names(spec, "RING-1")

    assert names == ["RING-1_campaign-pack.zip"]
    assert planned_outputs("campaign_pack", normalised_spec(spec, names)) == [
        PlannedOutput(
            name="RING-1_campaign-pack.zip", render_kind="campaign_pack", content_type="application/zip",
            max_bytes=4 * 1024**3 - 1, width=None, height=None, label=None,
        )
    ]


@pytest.mark.parametrize(
    ("changes", "edge"),
    [
        ({}, 2000),
        ({"stillSize": 1000}, 1920),  # the 16:9 turntable
        ({"stillSize": 1000, "turntable": {"enabled": False}}, 1080),  # the spin
        ({"stillSize": 1000, "turntable": {"enabled": False}, "spin": {"size": 2048}}, 2048),
        ({"stillSize": 4000}, 4000),
    ],
)
def test_a_packs_longest_side_is_its_largest_part(changes, edge):
    normalised = normalised_spec(_parse(pack(**changes)), ["pack.zip"])

    assert longest_edge("campaign_pack", normalised) == edge
    # Its stills' size stands for its frame size in a quote.
    assert frame_size("campaign_pack", normalised) == (normalised["stillSize"], normalised["stillSize"])
