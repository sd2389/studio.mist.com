"""Render job specs: strict models per kind, their prices, and the names of the files they make."""

import pytest
from fastapi import HTTPException

from app.features.render_jobs.job_files import (
    PlannedOutput,
    longest_edge,
    normalised_spec,
    output_names,
    output_stem,
    planned_outputs,
)
from app.features.render_jobs.pricing import render_job_cost
from app.features.render_jobs.specs import check_poses, parse_spec, spec_warnings

VIEW = {"view": {"position": [0.62, 0.88, 2.25], "target": [0, 0, 0]}}
TURNTABLE = {"width": 1920, "height": 1080, "fps": 30, "frames": 120, "path": {"orbit": {"start": VIEW}}}
SPIN = {"frames": 72, "size": 1080, "format": "jpeg", "jpeg_quality": 0.9}


def _still(**changes) -> dict:
    return {"camera": VIEW, "width": 3840, "height": 2160, **changes}


def _turntable(**changes) -> dict:
    return {**TURNTABLE, **changes}


def _spin(**changes) -> dict:
    return {**SPIN, **changes}


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


@pytest.mark.parametrize("kind", ["convert", "batch_archive"])
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

    check_poses(spec, [{"id": "pose-hero"}])
    with pytest.raises(HTTPException) as exc:
        check_poses(spec, [])
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
    assert spec_warnings(parse_spec("spin", _spin(transparent=True)))
    assert spec_warnings(parse_spec("turntable", _turntable())) == []


# ---------------------------------------------------------------------------
# Turntables and spins
# ---------------------------------------------------------------------------


def test_a_turntable_keeps_its_own_frame_count():
    """The harness reads `frames` as the number of frames to render, not the number of files."""
    spec = parse_spec("turntable", _turntable())

    assert normalised_spec(spec, ["ring.mp4"]) == {
        "width": 1920,
        "height": 1080,
        "fps": 30,
        "frames": 120,
        "quality": "high",
        "path": {"orbit": {"start": VIEW}},
        "output_names": ["ring.mp4"],
    }


def test_a_spin_keeps_its_own_frame_count():
    spec = parse_spec("spin", _spin())

    assert normalised_spec(spec, ["ring-spin.zip"]) == {
        "frames": 72,
        "size": 1080,
        "format": "jpeg",
        "jpeg_quality": 0.9,
        "transparent": False,
        "output_names": ["ring-spin.zip"],
    }


@pytest.mark.parametrize(
    ("path", "kept"),
    [
        ({"orbit": {"start": {"pose": "pose-hero"}}}, {"orbit": {"start": {"pose": "pose-hero"}}}),
        ({"orbit": {"start": {"angle": "side"}}}, {"orbit": {"start": {"angle": "side", "margin_pct": 8.0}}}),
        ({"poses": ["pose-top", "pose-hero", "pose-top"]}, {"poses": ["pose-top", "pose-hero", "pose-top"]}),
    ],
)
def test_a_turntable_orbits_from_any_camera_or_cuts_through_poses(path, kept):
    spec = parse_spec("turntable", _turntable(path=path, quality="max"))

    assert normalised_spec(spec, [])["path"] == kept


@pytest.mark.parametrize(
    ("spec", "field"),
    [
        (_turntable(width=1921), "spec.width"),
        (_turntable(height=1081), "spec.height"),
        (_turntable(width=62), "spec.width"),
        (_turntable(width=8194), "spec.width"),
        (_turntable(width=8192, height=8192), "spec"),
        (_turntable(fps=0), "spec.fps"),
        (_turntable(fps=61), "spec.fps"),
        (_turntable(fps=29.97), "spec.fps"),
        (_turntable(fps="30"), "spec.fps"),
        (_turntable(frames=0), "spec.frames"),
        (_turntable(frames=3601), "spec.frames"),
        (_turntable(frames=120.0), "spec.frames"),
        (_turntable(quality="ultra"), "spec.quality"),
        (_turntable(path={}), "spec.path"),
        (_turntable(path={"orbit": {"start": VIEW}, "poses": ["pose-top"]}), "spec.path"),
        (_turntable(path={"orbit": {}}), "spec.path.orbit.start"),
        (_turntable(path={"orbit": {"start": {"angle": "below"}}}), "spec.path.orbit.start.angle"),
        (_turntable(path={"spiral": {}}), "spec.path.spiral"),
        (_turntable(path={"poses": []}), "spec.path.poses"),
        (_turntable(path={"poses": ["../etc"]}), "spec.path.poses[0]"),
        (_turntable(path={"poses": ["pose-top"] * 33}), "spec.path.poses"),
        (_turntable(frames=2, path={"poses": ["pose-top", "pose-left", "pose-right"]}), "spec"),
        (_turntable(transparent=False), "spec.transparent"),
        (_turntable(format="png"), "spec.format"),
    ],
)
def test_a_bad_turntable_is_refused_naming_the_field(spec, field):
    assert _refused("turntable", spec).startswith(f"{field}:")


def test_a_turntable_is_even_on_both_sides_for_h264():
    assert _refused("turntable", _turntable(width=1919)) == "spec.width: must be even, for H.264's 4:2:0 chroma"


@pytest.mark.parametrize(
    ("spec", "field"),
    [
        (_spin(frames=0), "spec.frames"),
        (_spin(frames=145), "spec.frames"),
        (_spin(frames=72.0), "spec.frames"),
        (_spin(size=63), "spec.size"),
        (_spin(size=2049), "spec.size"),
        (_spin(format="webp"), "spec.format"),
        (_spin(jpeg_quality=0.5), "spec.jpeg_quality"),
        (_spin(width=1080), "spec.width"),
        ({"frames": 72}, "spec.size"),
    ],
)
def test_a_bad_spin_is_refused_naming_the_field(spec, field):
    assert _refused("spin", spec).startswith(f"{field}:")


@pytest.mark.parametrize(
    ("width", "height", "credits"),
    [
        (1280, 720, 2),  # 720p
        (1920, 1080, 3),  # 1080p
        (1080, 1080, 3),
        (1080, 1920, 3),
        (3840, 2160, 8),  # 4K
        (7680, 4320, 20),  # 8K
    ],
)
def test_a_turntable_costs_its_frame_size_for_every_started_10_seconds(width, height, credits):
    def cost(frames: int) -> int:
        return render_job_cost("turntable", parse_spec("turntable", _turntable(width=width, height=height, frames=frames)))

    assert (cost(1), cost(300), cost(301), cost(1800)) == (credits, credits, 2 * credits, 6 * credits)


@pytest.mark.parametrize(
    ("fps", "frames", "credits"),
    [
        (30, 120, 3),  # the 360° dialog's 4 s at 1080p
        (24, 240, 3),  # 10 s
        (24, 241, 6),
        (30, 600, 6),  # 20 s
        (31, 310, 6),  # 10 s, double above 30 fps
        (60, 600, 6),
        (60, 601, 12),
        (60, 3600, 36),  # a minute at 60 fps
    ],
)
def test_a_turntable_counts_double_above_30_fps(fps, frames, credits):
    assert render_job_cost("turntable", parse_spec("turntable", _turntable(fps=fps, frames=frames))) == credits


@pytest.mark.parametrize(
    ("size", "frames", "credits"),
    [
        (1080, 72, 2),
        (1080, 36, 2),
        (1095, 72, 2),  # 1.2 MP
        (1096, 72, 4),
        (2048, 72, 4),
        (1080, 73, 4),  # double above 72 frames
        (1080, 144, 4),
        (2048, 144, 8),
    ],
)
def test_a_spin_costs_its_frame_size_double_above_72_frames(size, frames, credits):
    assert render_job_cost("spin", parse_spec("spin", _spin(size=size, frames=frames))) == credits


def test_a_turntable_makes_one_mp4_and_a_spin_one_zip():
    assert output_names(parse_spec("turntable", _turntable()), "ring") == ["ring.mp4"]
    assert output_names(parse_spec("spin", _spin()), "ring") == ["ring-spin.zip"]


def test_a_turntables_poses_must_be_saved_in_the_look_or_built_in():
    cut = parse_spec("turntable", _turntable(path={"poses": ["pose-top", "pose-hero"]}))
    orbit = parse_spec("turntable", _turntable(path={"orbit": {"start": {"pose": "pose-hero"}}}))

    check_poses(cut, [{"id": "pose-hero"}])
    check_poses(orbit, [{"id": "pose-hero"}])
    details = []
    for spec in (cut, orbit):
        with pytest.raises(HTTPException) as exc:
            check_poses(spec, [])
        details.append(exc.value.detail)
    assert details == [
        "spec.path.poses[1]: the look has no pose 'pose-hero'",
        "spec.path.orbit.start.pose: the look has no pose 'pose-hero'",
    ]


def test_a_turntables_file_is_one_mp4_its_frame_size():
    spec = normalised_spec(parse_spec("turntable", _turntable(width=1080, height=1920)), ["ring.mp4"])

    assert planned_outputs("turntable", spec) == [
        PlannedOutput(
            name="ring.mp4", render_kind="turntable", content_type="video/mp4",
            max_bytes=4 * 1024**3, width=1080, height=1920, label=None,
        )
    ]
    assert longest_edge("turntable", spec) == 1920


def test_a_spins_file_is_one_zip_of_frames_its_size_square():
    """The ZIP holds the frames and spin.html; it has no ZIP64, so it stays under 4 GB."""
    spec = normalised_spec(parse_spec("spin", _spin(size=1500)), ["ring-spin.zip"])

    assert planned_outputs("spin", spec) == [
        PlannedOutput(
            name="ring-spin.zip", render_kind="spin", content_type="application/zip",
            max_bytes=4 * 1024**3 - 1, width=1500, height=1500, label=None,
        )
    ]
    assert longest_edge("spin", spec) == 1500
