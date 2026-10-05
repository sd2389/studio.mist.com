"""Render job specs: one strict Pydantic model per kind (docs/adr/0005-server-exports.md).

Unknown fields are refused. A job keeps its spec normalised, with its frame count and the names
of the files it makes. Kinds whose phase hasn't shipped answer 400.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.core.validation import validation_detail
from app.features.scene.look import POSE_ID, CameraCoordinate, Position

# Limits for every plan; the plan's own size cap is checked against the spec as well.
MAX_EDGE = 8192
MAX_FRAME_PIXELS = 36_000_000
MAX_CAMERAS = 12
LATER_KINDS = frozenset({"turntable", "spin", "campaign_pack", "convert", "batch_archive"})
# The studio's four built-in poses (DEFAULT_POSES in src/lib/viewer-scene.ts); a look saves only its own.
DEFAULT_POSE_IDS = frozenset({"pose-top", "pose-right", "pose-default", "pose-left"})
DEFAULT_MARGIN_PCT = 8.0
MAX_NAME_LENGTH = 96

# The Campaign Pack's built-in angles (src/features/render/campaign-pack/domain/defaults.ts).
PackAngle = Literal["front", "three-quarter", "top", "side"]

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


class ImageSpec(SpecModel):
    """What every image of a still or an angle set shares."""

    width: int = Field(ge=64, le=MAX_EDGE)
    height: int = Field(ge=64, le=MAX_EDGE)
    format: Literal["png", "jpeg"] = "png"
    jpeg_quality: float = Field(default=0.95, ge=0.8, le=1)
    # A PNG cutout without the set and its shadow.
    transparent: bool = False

    @model_validator(mode="after")
    def _fits_one_frame(self) -> ImageSpec:
        if self.width * self.height > MAX_FRAME_PIXELS:
            raise ValueError(f"at most {MAX_FRAME_PIXELS // 1_000_000} megapixels an image")
        return self


class StillSpec(ImageSpec):
    camera: Camera


class AngleSetSpec(ImageSpec):
    """One look from several cameras."""

    cameras: list[Camera] = Field(min_length=1, max_length=MAX_CAMERAS)


Spec = StillSpec | AngleSetSpec
SPEC_MODELS: dict[str, type[StillSpec] | type[AngleSetSpec]] = {"still": StillSpec, "angle_set": AngleSetSpec}


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
    """Each camera with its field name in the spec."""
    if isinstance(spec, StillSpec):
        return [("camera", spec.camera)]
    return [(f"cameras[{index}]", camera) for index, camera in enumerate(spec.cameras)]


def check_poses(spec: Spec, saved_pose_ids: set[str]) -> None:
    """400 when a camera names a pose that is neither saved in the look nor built in."""
    for field, camera in spec_cameras(spec):
        if camera.pose is not None and camera.pose not in saved_pose_ids | DEFAULT_POSE_IDS:
            raise HTTPException(status_code=400, detail=f"spec.{field}.pose: the look has no pose '{camera.pose}'")


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
    """One file name per image, in camera order; an angle set's names carry each camera's label."""
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


def normalised_spec(spec: Spec, output_names: list[str]) -> dict[str, Any]:
    """What the job keeps: the validated spec, its frame count and its output names."""
    return {
        **spec.model_dump(mode="json", exclude_none=True),
        "frames": len(output_names),
        "output_names": output_names,
    }


def spec_warnings(spec: Spec) -> list[str]:
    if spec.transparent and spec.format == "jpeg":
        return ["A JPEG can't be transparent, so the cutout gets a white background. Choose PNG to keep it."]
    return []


# What a job's images are stored as, by the spec's format.
IMAGE_CONTENT_TYPES = {"png": "image/png", "jpeg": "image/jpeg"}
# The largest file one image may be. A 36 MP frame takes 144 MB even stored raw.
MAX_IMAGE_BYTES = 256 * 1024 * 1024


@dataclass(frozen=True)
class PlannedOutput:
    """One file a job makes, as the spec it keeps names it."""

    name: str
    render_kind: str  # the kind of the render it becomes
    content_type: str
    max_bytes: int
    width: int | None
    height: int | None
    # The camera's angle or pose id, as the harness labels the file; none for a live view.
    label: str | None


def planned_outputs(kind: str, spec: Mapping[str, Any]) -> list[PlannedOutput]:
    """The files a job makes, in camera order, read from its normalised spec."""
    if kind not in SPEC_MODELS:
        raise ValueError(f"No outputs for a '{kind}' job")
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


def longest_edge(spec: Mapping[str, Any]) -> int:
    """The longest side a job renders: what its owner's plan allowed when the job was created."""
    return max(spec["width"], spec["height"])
