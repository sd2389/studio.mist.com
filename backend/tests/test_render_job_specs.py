"""Render job specs: strict models per kind, their prices, and the names of the files they make."""

import pytest
from fastapi import HTTPException

from app.features.render_jobs.pricing import render_job_cost
from app.features.render_jobs.specs import (
    check_poses,
    normalised_spec,
    output_names,
    output_stem,
    parse_spec,
    spec_warnings,
)

VIEW = {"view": {"position": [0.62, 0.88, 2.25], "target": [0, 0, 0]}}


def _still(**changes) -> dict:
    return {"camera": VIEW, "width": 3840, "height": 2160, **changes}


def _refused(kind: str, spec: dict) -> str:
    with pytest.raises(HTTPException) as exc:
        parse_spec(kind, spec)
    assert exc.value.status_code == 400
    return exc.value.detail


def test_a_still_is_normalised_with_its_defaults_frames_and_output_names():
    spec = parse_spec("still", _still())

    assert normalised_spec(spec, ["ring.png"]) == {
        "camera": VIEW,
        "width": 3840,
        "height": 2160,
        "format": "png",
        "jpeg_quality": 0.95,
        "transparent": False,
        "frames": 1,
        "output_names": ["ring.png"],
    }


@pytest.mark.parametrize(
    "camera",
    [{"pose": "pose-hero"}, {"angle": "three-quarter"}, {"angle": "top", "margin_pct": 0}],
)
def test_a_camera_is_a_view_a_pose_or_an_angle(camera):
    parse_spec("still", _still(camera=camera))


def test_an_angle_is_framed_with_the_packs_margin_by_default():
    spec = parse_spec("still", _still(camera={"angle": "front"}))

    assert normalised_spec(spec, [])["camera"] == {"angle": "front", "margin_pct": 8.0}


@pytest.mark.parametrize(
    ("spec", "field"),
    [
        (_still(camera={}), "spec.camera"),
        (_still(camera={"pose": "pose-hero", "angle": "front"}), "spec.camera"),
        (_still(camera={"pose": "pose-hero", "margin_pct": 5}), "spec.camera"),
        (_still(camera={"angle": "below"}), "spec.camera.angle"),
        (_still(camera={"angle": "front", "margin_pct": 25}), "spec.camera.margin_pct"),
        (_still(camera={"view": {"position": [0, 0, 31], "target": [0, 0, 0]}}), "spec.camera.view.position[2]"),
        (_still(camera={"view": {"position": [0, 0, float("inf")], "target": [0, 0, 0]}}), "spec.camera.view.position[2]"),
        (_still(camera={"view": {"position": [0, 0], "target": [0, 0, 0]}}), "spec.camera.view.position"),
        (_still(camera={"pose": "../../etc"}), "spec.camera.pose"),
        (_still(width=63), "spec.width"),
        (_still(width=8193), "spec.width"),
        (_still(width="3840"), "spec.width"),
        (_still(width=8192, height=8192), "spec"),
        (_still(format="webp"), "spec.format"),
        (_still(jpeg_quality=0.5), "spec.jpeg_quality"),
        (_still(transparent="yes"), "spec.transparent"),
        (_still(fps=30), "spec.fps"),
    ],
)
def test_a_bad_still_is_refused_naming_the_field(spec, field):
    assert _refused("still", spec).startswith(f"{field}:")


def test_an_angle_set_takes_1_to_12_cameras():
    cameras = [{"angle": "front"}, {"pose": "pose-top"}, VIEW]
    assert len(parse_spec("angle_set", {"cameras": cameras, "width": 2000, "height": 2000}).cameras) == 3

    assert _refused("angle_set", {"cameras": [], "width": 2000, "height": 2000}).startswith("spec.cameras:")
    assert _refused("angle_set", {"cameras": [VIEW] * 13, "width": 2000, "height": 2000}).startswith("spec.cameras:")
    assert _refused("angle_set", _still()).startswith("spec.")


@pytest.mark.parametrize("kind", ["turntable", "spin", "campaign_pack", "convert", "batch_archive"])
def test_kinds_of_later_phases_answer_400(kind):
    assert _refused(kind, {}) == f"kind: '{kind}' is not available yet"


def test_an_unknown_kind_is_refused():
    assert _refused("hologram", {}) == "kind: 'hologram' is not a job kind"


@pytest.mark.parametrize(
    ("width", "height", "credits"),
    [
        (2560, 1440, 1),  # 2K 16:9
        (2000, 2000, 1),
        (2048, 2048, 1),  # Quick still
        (3840, 2160, 2),  # 4K 16:9
        (3000, 3000, 2),
        (4000, 4000, 3),
        (7680, 4320, 4),  # 8K
    ],
)
def test_a_still_costs_what_the_credit_table_says(width, height, credits):
    assert render_job_cost("still", parse_spec("still", _still(width=width, height=height))) == credits


def test_an_angle_set_costs_each_of_its_images():
    spec = parse_spec("angle_set", {"cameras": [{"angle": "front"}] * 4, "width": 2000, "height": 2000})

    assert render_job_cost("angle_set", spec) == 4


def test_a_pose_must_be_saved_in_the_look_or_built_in():
    spec = parse_spec("angle_set", {"cameras": [{"pose": "pose-top"}, {"pose": "pose-hero"}], "width": 512, "height": 512})

    check_poses(spec, {"pose-hero"})
    with pytest.raises(HTTPException) as exc:
        check_poses(spec, set())
    assert exc.value.detail == "spec.cameras[1].pose: the look has no pose 'pose-hero'"


def test_output_names_come_from_a_clean_stem():
    assert output_stem("Solitaire 4K / 16:9", "R-1001", "Ring") == "Solitaire-4K-16-9"
    assert output_stem("../..", None, "Ring") == "Ring"
    assert output_stem(None, None, None) == "render"
    assert output_stem("x" * 200) == "x" * 96

    still = parse_spec("still", _still(format="jpeg"))
    assert output_names(still, "ring") == ["ring.jpg"]


def test_an_angle_sets_files_are_named_by_camera_and_never_twice():
    cameras = [{"angle": "front"}, {"angle": "front"}, {"pose": "pose-top"}, VIEW]
    spec = parse_spec("angle_set", {"cameras": cameras, "width": 512, "height": 512})

    assert output_names(spec, "ring") == ["ring-front.png", "ring-front-2.png", "ring-pose-top.png", "ring-view-4.png"]


def test_a_transparent_jpeg_is_warned_about():
    assert spec_warnings(parse_spec("still", _still(format="jpeg", transparent=True)))
    assert spec_warnings(parse_spec("still", _still(transparent=True))) == []
