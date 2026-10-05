"""Render job specs: one strict Pydantic model per kind (docs/adr/0005-server-exports.md).

Unknown fields are refused. A job keeps its spec normalised, with its frame count and the names
of the files it makes. Kinds whose phase hasn't shipped answer 400.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Annotated, Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.core.validation import validation_detail
from app.features.scene.look import MAX_POSES, POSE_ID, CameraCoordinate, Position

# Limits for every plan; the plan's own caps are checked against the spec as well (plan_limits.py).
MAX_EDGE = 8192
MAX_FRAME_PIXELS = 36_000_000
MAX_CAMERAS = 12
# A turntable: at most 60 fps (the Videos tab's 90 and 120 are dropped) and 3,600 frames, a
# minute at 60 fps. A spin: at most 144 frames, of at most 2048 px square.
MAX_VIDEO_FPS = 60
MAX_VIDEO_FRAMES = 3600
MAX_SPIN_FRAMES = 144
MAX_SPIN_SIZE = 2048
LATER_KINDS = frozenset({"campaign_pack", "convert", "batch_archive"})
# The studio's four built-in poses (DEFAULT_POSES in src/lib/viewer-scene.ts); a look saves only its own.
DEFAULT_POSE_IDS = frozenset({"pose-top", "pose-right", "pose-default", "pose-left"})
DEFAULT_MARGIN_PCT = 8.0
MAX_NAME_LENGTH = 96

# The Campaign Pack's built-in angles (src/features/render/campaign-pack/domain/defaults.ts).
PackAngle = Literal["front", "three-quarter", "top", "side"]
PoseId = Annotated[str, Field(pattern=POSE_ID)]

_UNSAFE_NAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


class SpecModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class View(SpecModel):
    position: list[CameraCoordinate] = Field(min_length=3, max_length=3)
    target: list[Position] = Field(min_length=3, max_length=3)


class Camera(SpecModel):
    """One of three shapes.

    `{"view": {...}}`: the live camera, drawn with the viewer's 42° field of view.
    `{"pose": "pose-hero"}`: a pose saved in the look, or a built-in one.
    `{"angle": "three-quarter", "margin_pct": 8}`: a Campaign Pack angle, framed on the model.
    """

    view: View | None = None
    pose: str | None = Field(default=None, pattern=POSE_ID)
    angle: PackAngle | None = None
    margin_pct: float | None = Field(default=None, ge=0, le=20)

    @model_validator(mode="after")
    def _has_one_shape(self) -> Camera:
        if [self.view, self.pose, self.angle].count(None) != 2:
            raise ValueError("a camera is one of view, pose or angle")
        if self.angle is None and self.margin_pct is not None:
            raise ValueError("margin_pct frames an angle")
        if self.angle is not None and self.margin_pct is None:
            self.margin_pct = DEFAULT_MARGIN_PCT
        return self


class FrameSize(SpecModel):
    """The size of every image of a still or an angle set, or of every frame of a turntable."""

    width: int = Field(ge=64, le=MAX_EDGE)
    height: int = Field(ge=64, le=MAX_EDGE)

    @model_validator(mode="after")
    def _fits_one_frame(self) -> FrameSize:
        if self.width * self.height > MAX_FRAME_PIXELS:
            raise ValueError(f"at most {MAX_FRAME_PIXELS // 1_000_000} megapixels a frame")
        return self


class ImageEncoding(SpecModel):
    """How the images of a still, an angle set or a spin are encoded."""

    format: Literal["png", "jpeg"] = "png"
    jpeg_quality: float = Field(default=0.95, ge=0.8, le=1)
    # A PNG cutout without the set and its shadow.
    transparent: bool = False


class ImageSpec(ImageEncoding, FrameSize):
    """What every image of a still or an angle set shares."""


class StillSpec(ImageSpec):
    camera: Camera


class AngleSetSpec(ImageSpec):
    """One look from several cameras."""

    cameras: list[Camera] = Field(min_length=1, max_length=MAX_CAMERAS)


class OrbitPath(SpecModel):
    start: Camera


class TurntablePath(SpecModel):
    """Where a turntable's camera goes: `{"orbit": {"start": camera}}`, once round the target from
    that camera, frame 0 being the camera itself (the studio's turntable of the live view); or
    `{"poses": [ids]}`, a cut through saved or built-in poses, each held for an equal share of the
    frames (the studio's "Multi-angle")."""

    orbit: OrbitPath | None = None
    poses: list[PoseId] | None = Field(default=None, min_length=1, max_length=MAX_POSES)

    @model_validator(mode="after")
    def _is_one_path(self) -> TurntablePath:
        if (self.orbit is None) == (self.poses is None):
            raise ValueError("a path is an orbit or poses")
        return self


class TurntableSpec(FrameSize):
    """A video: the harness renders its frames and the worker encodes them as one H.264 MP4."""

    fps: int = Field(ge=1, le=MAX_VIDEO_FPS)
    frames: int = Field(ge=1, le=MAX_VIDEO_FRAMES)
    # The worker's x264 CRF: standard 23, high 20, max 17.
    quality: Literal["standard", "high", "max"] = "high"
    path: TurntablePath

    @field_validator("width", "height")
    @classmethod
    def _is_even(cls, value: int) -> int:
        if value % 2:
            raise ValueError("must be even, for H.264's 4:2:0 chroma")
        return value

    @model_validator(mode="after")
    def _shows_every_pose(self) -> TurntableSpec:
        poses = self.path.poses or []
        if self.frames < len(poses):
            raise ValueError(f"a cut through {len(poses)} poses needs at least {len(poses)} frames")
        return self


class SpinSpec(ImageEncoding):
    """A 360° spin: `frames` frames of `size` px square, once round the piece on the Campaign
    Pack's spin orbit. The worker puts them and the pack's viewer page in one ZIP."""

    frames: int = Field(ge=1, le=MAX_SPIN_FRAMES)
    size: int = Field(ge=64, le=MAX_SPIN_SIZE)


Spec = StillSpec | AngleSetSpec | TurntableSpec | SpinSpec
SPEC_MODELS: dict[str, type[Spec]] = {
    "still": StillSpec,
    "angle_set": AngleSetSpec,
    "turntable": TurntableSpec,
    "spin": SpinSpec,
}


def parse_spec(kind: str, spec: dict[str, Any]) -> Spec:
    """The spec of a `kind` job, validated, or 400 naming the offending field."""
    model = SPEC_MODELS.get(kind)
    if model is None:
        reason = "is not available yet" if kind in LATER_KINDS else "is not a job kind"
        raise HTTPException(status_code=400, detail=f"kind: '{kind}' {reason}")
    try:
        return model.model_validate(spec)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=validation_detail(exc, "spec")) from exc


def spec_cameras(spec: Spec) -> list[tuple[str, Camera]]:
    """Each camera with its field name in the spec: a still's, an angle set's, or the start of a
    turntable's orbit."""
    if isinstance(spec, StillSpec):
        return [("camera", spec.camera)]
    if isinstance(spec, AngleSetSpec):
        return [(f"cameras[{index}]", camera) for index, camera in enumerate(spec.cameras)]
    if isinstance(spec, TurntableSpec) and spec.path.orbit is not None:
        return [("path.orbit.start", spec.path.orbit.start)]
    return []


def _named_poses(spec: Spec) -> list[tuple[str, str]]:
    """Each pose the spec names, with its field: a camera's, or one a turntable cuts to."""
    poses = [(f"{field}.pose", camera.pose) for field, camera in spec_cameras(spec) if camera.pose is not None]
    if isinstance(spec, TurntableSpec) and spec.path.poses is not None:
        poses += [(f"path.poses[{index}]", pose) for index, pose in enumerate(spec.path.poses)]
    return poses


def check_poses(spec: Spec, saved_pose_ids: set[str]) -> None:
    """400 when the spec names a pose that is neither saved in the look nor built in."""
    for field, pose in _named_poses(spec):
        if pose not in saved_pose_ids | DEFAULT_POSE_IDS:
            raise HTTPException(status_code=400, detail=f"spec.{field}: the look has no pose '{pose}'")


def clean_file_stem(value: str | None) -> str:
    """`value` cleaned to [A-Za-z0-9._-], at most 96 characters; empty when nothing is left."""
    cleaned = _UNSAFE_NAME_CHARS.sub("-", value or "").strip("-._")
    return cleaned[:MAX_NAME_LENGTH].rstrip("-._")


def output_stem(*candidates: str | None) -> str:
    """The outputs' file stem: the first candidate with something left after cleaning."""
    for candidate in candidates:
        stem = clean_file_stem(candidate)
        if stem:
            return stem
    return "render"


def _camera_label(camera: Camera, number: int) -> str:
    if camera.angle is not None:
        return camera.angle
    if camera.pose is not None:
        return clean_file_stem(camera.pose) or f"pose-{number}"
    return f"view-{number}"


def output_names(spec: Spec, stem: str) -> list[str]:
    """The names of the files a job makes: one per image in camera order, an angle set's carrying
    each camera's label; a turntable's MP4; a spin's ZIP."""
    if isinstance(spec, TurntableSpec):
        return [f"{stem}.mp4"]
    if isinstance(spec, SpinSpec):
        return [f"{stem}-spin.zip"]
    extension = "jpg" if spec.format == "jpeg" else "png"
    if isinstance(spec, StillSpec):
        return [f"{stem}.{extension}"]
    names: list[str] = []
    for number, camera in enumerate(spec.cameras, start=1):
        label = _camera_label(camera, number)
        name, repeat = f"{stem}-{label}.{extension}", 2
        while name in names:
            name, repeat = f"{stem}-{label}-{repeat}.{extension}", repeat + 1
        names.append(name)
    return names


def frame_count(spec: Spec) -> int:
    """How many images or frames a job renders: one an image of a still or an angle set, or a
    turntable's or a spin's own count."""
    if isinstance(spec, TurntableSpec | SpinSpec):
        return spec.frames
    return len(spec_cameras(spec))


def normalised_spec(spec: Spec, output_names: list[str]) -> dict[str, Any]:
    """What the job keeps: the validated spec, its frame count and its output names."""
    return {
        **spec.model_dump(mode="json", exclude_none=True),
        "frames": frame_count(spec),
        "output_names": output_names,
    }


def spec_warnings(spec: Spec) -> list[str]:
    if isinstance(spec, ImageEncoding) and spec.transparent and spec.format == "jpeg":
        return ["A JPEG can't be transparent, so the cutout gets a white background. Choose PNG to keep it."]
    return []


# What a job's files are stored as: images by the spec's format, a turntable's MP4, a spin's ZIP.
IMAGE_CONTENT_TYPES = {"png": "image/png", "jpeg": "image/jpeg"}
VIDEO_CONTENT_TYPE = "video/mp4"
ZIP_CONTENT_TYPE = "application/zip"
# The largest file each output may be. A 36 MP frame takes 144 MB even stored raw. A minute of
# 4K at 60 fps would have to run at 570 Mbit/s to reach 4 GB, and one signed PUT takes up to
# 5 GB. A ZIP has no ZIP64 (the worker's fflate writer), so it stays under 4 GB: the largest
# spin, 144 frames of 2048 px square, takes 2.4 GB even stored raw.
MAX_IMAGE_BYTES = 256 * 1024 * 1024
MAX_VIDEO_BYTES = 4 * 1024**3
MAX_ZIP_BYTES = 4 * 1024**3 - 1


@dataclass(frozen=True)
class PlannedOutput:
    """One file a job makes, as the spec it keeps names it."""

    name: str
    render_kind: str  # the kind of the render it becomes
    content_type: str
    max_bytes: int
    # An image's size; a turntable's or a spin's frame size, for its MP4 or its ZIP.
    width: int | None
    height: int | None
    # The camera's angle or pose id, as the harness labels the file; none for a live view, an
    # MP4 or a ZIP.
    label: str | None


def _single_output(kind: str, spec: Mapping[str, Any], content_type: str, max_bytes: int) -> PlannedOutput:
    """The one file a turntable or a spin makes, which its frames go into."""
    [name] = spec["output_names"]
    width, height = frame_size(kind, spec)
    return PlannedOutput(
        name=name,
        render_kind=kind,
        content_type=content_type,
        max_bytes=max_bytes,
        width=width,
        height=height,
        label=None,
    )


def planned_outputs(kind: str, spec: Mapping[str, Any]) -> list[PlannedOutput]:
    """The files a job makes, read from its normalised spec: a still's or an angle set's images in
    camera order, a turntable's MP4, or a spin's ZIP of its frames and its viewer page."""
    if kind not in SPEC_MODELS:
        raise ValueError(f"No outputs for a '{kind}' job")
    if kind == "turntable":
        return [_single_output(kind, spec, VIDEO_CONTENT_TYPE, MAX_VIDEO_BYTES)]
    if kind == "spin":
        return [_single_output(kind, spec, ZIP_CONTENT_TYPE, MAX_ZIP_BYTES)]
    cameras = [spec["camera"]] if kind == "still" else spec["cameras"]
    content_type = IMAGE_CONTENT_TYPES[spec["format"]]
    return [
        PlannedOutput(
            name=name,
            render_kind="still",
            content_type=content_type,
            max_bytes=MAX_IMAGE_BYTES,
            width=spec["width"],
            height=spec["height"],
            label=camera.get("angle") or camera.get("pose"),
        )
        for name, camera in zip(spec["output_names"], cameras, strict=True)
    ]


def frame_size(kind: str, spec: Mapping[str, Any]) -> tuple[int, int]:
    """The width and height of every image or frame a job renders, read from its normalised spec;
    a spin's frames are `size` square."""
    if kind == "spin":
        return spec["size"], spec["size"]
    return spec["width"], spec["height"]


def longest_edge(kind: str, spec: Mapping[str, Any]) -> int:
    """The longest side a job renders: what its owner's plan allowed when the job was created."""
    return max(frame_size(kind, spec))
