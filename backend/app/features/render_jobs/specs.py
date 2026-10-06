"""Render job specs: one strict Pydantic model per kind (docs/adr/0005-server-exports.md).

Unknown fields are refused. A job keeps its spec normalised, with its frame count and the names
of the files it makes (job_files.py). Kinds whose phase hasn't shipped answer 400.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Annotated, Any, Literal, get_args

from fastapi import HTTPException
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.core.validation import validation_detail
from app.features.render_jobs.campaign_pack import (
    MAX_PACK_ANGLES,
    MAX_PACK_METALS,
    PACK_METALS,
    PACK_STILL_SIZES,
    POSE_ANGLE_PREFIX,
    PackPart,
    PackVideoFormat,
    pack_parts,
)
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
LATER_KINDS = frozenset({"convert", "batch_archive"})
# The studio's four built-in poses (DEFAULT_POSES in src/lib/viewer-scene.ts); a look saves only its own.
DEFAULT_POSE_IDS = frozenset({"pose-top", "pose-right", "pose-default", "pose-left"})
DEFAULT_MARGIN_PCT = 8.0

# The Campaign Pack's built-in angles (src/features/render/campaign-pack/domain/defaults.ts).
PackAngle = Literal["front", "three-quarter", "top", "side"]
PoseId = Annotated[str, Field(pattern=POSE_ID)]
VideoFps = Annotated[int, Field(ge=1, le=MAX_VIDEO_FPS)]
SpinFrames = Annotated[int, Field(ge=1, le=MAX_SPIN_FRAMES)]
SpinSize = Annotated[int, Field(ge=64, le=MAX_SPIN_SIZE)]


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

    fps: VideoFps
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

    frames: SpinFrames
    size: SpinSize


def _is_pack_metal(metal: str) -> str:
    if metal not in PACK_METALS:
        raise ValueError(f"'{metal}' is neither a metal preset nor 'current'")
    return metal


def _is_pack_angle(angle: str) -> str:
    pose = angle.removeprefix(POSE_ANGLE_PREFIX)
    if angle not in get_args(PackAngle) and not (pose != angle and re.fullmatch(POSE_ID, pose)):
        raise ValueError(f"'{angle}' is neither a built-in angle nor {POSE_ANGLE_PREFIX}<saved pose id>")
    return angle


def _is_pack_still_size(size: int) -> int:
    if size not in PACK_STILL_SIZES:
        *sizes, largest = PACK_STILL_SIZES
        raise ValueError(f"must be {', '.join(map(str, sizes))} or {largest}")
    return size


def _each_once(values: list[Any]) -> list[Any]:
    if len(set(values)) != len(values):
        raise ValueError("each at most once")
    return values


PackMetal = Annotated[str, AfterValidator(_is_pack_metal)]
PackAngleId = Annotated[str, AfterValidator(_is_pack_angle)]


class PackFormats(SpecModel):
    jpg: bool
    png: bool


class PackBackground(SpecModel):
    """What the stills, the videos and the spin frames are flattened onto: white, the studio's own
    backdrop and set (`scene`), or a colour the dialog's picker gave (#rrggbb)."""

    kind: Literal["white", "scene", "custom"]
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")

    @model_validator(mode="after")
    def _has_a_colour_when_custom(self) -> PackBackground:
        if (self.kind == "custom") != (self.color is not None):
            raise ValueError("a custom background has a colour, and only a custom one")
        return self


class PackTurntable(SpecModel):
    """A turntable of every metal in each format, `durationSec` long at `fps`."""

    enabled: bool
    formats: Annotated[list[PackVideoFormat], AfterValidator(_each_once)] = Field(max_length=3)
    durationSec: int = Field(ge=1)
    fps: VideoFps

    @model_validator(mode="after")
    def _fits_one_video(self) -> PackTurntable:
        if self.durationSec * self.fps > MAX_VIDEO_FRAMES:
            raise ValueError(f"at most {MAX_VIDEO_FRAMES} frames a turntable")
        return self


class PackSpin(SpecModel):
    """A spin of every metal, `frames` frames of `size` px square."""

    enabled: bool
    frames: SpinFrames
    size: SpinSize


class CampaignPackSpec(SpecModel):
    """The pack's CampaignPackConfig (src/features/render/campaign-pack/domain/types.ts), whole,
    as the dialog resolves it. `angleIds` are built-in angles or "pose:<id>" of a pose the look
    saves; `metals` are the studio's metal presets or "current", the model as configured."""

    metals: Annotated[list[PackMetal], AfterValidator(_each_once)] = Field(min_length=1, max_length=MAX_PACK_METALS)
    angleIds: Annotated[list[PackAngleId], AfterValidator(_each_once)] = Field(max_length=MAX_PACK_ANGLES)
    stillSize: Annotated[int, AfterValidator(_is_pack_still_size)]
    formats: PackFormats
    background: PackBackground
    jpegQuality: float = Field(ge=0.8, le=1)
    autoFrame: bool
    # Empty border on every side, as a percentage of the frame.
    marginPct: float = Field(ge=0, le=20)
    contactShadow: bool
    turntable: PackTurntable
    spin: PackSpin
    # The live 3D embed's page and snippet; the pack has them only when the scene has a SKU.
    embed: bool
    # The ASET image of the stones, when the piece has ray-traced gems.
    cutScope: bool

    @model_validator(mode="after")
    def _renders_something(self) -> CampaignPackSpec:
        if not self.parts():
            raise ValueError("pick at least one angle, turntable format, the 360° spin or the ASET image")
        return self

    def parts(self) -> list[PackPart]:
        """What the pack renders (campaign_pack.pack_parts)."""
        return pack_parts(self.model_dump())


Spec = StillSpec | AngleSetSpec | TurntableSpec | SpinSpec | CampaignPackSpec
SPEC_MODELS: dict[str, type[Spec]] = {
    "still": StillSpec,
    "angle_set": AngleSetSpec,
    "turntable": TurntableSpec,
    "spin": SpinSpec,
    "campaign_pack": CampaignPackSpec,
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


def _pack_poses(spec: Spec) -> list[tuple[str, str]]:
    """Each saved pose a Campaign Pack takes as an angle, with its field."""
    if not isinstance(spec, CampaignPackSpec):
        return []
    return [
        (f"angleIds[{index}]", angle.removeprefix(POSE_ANGLE_PREFIX))
        for index, angle in enumerate(spec.angleIds)
        if angle.startswith(POSE_ANGLE_PREFIX)
    ]


def check_poses(spec: Spec, saved_poses: list[Mapping[str, Any]]) -> None:
    """400 when the spec names a pose the look doesn't have. A camera or a turntable names one the
    look saves or a built-in one; a Campaign Pack's angle only one the user saved, as the pack's
    picker offers them (its built-in angles stand for the built-in poses)."""
    saved = {pose["id"] for pose in saved_poses}
    for field, pose in _named_poses(spec):
        if pose not in saved | DEFAULT_POSE_IDS:
            raise HTTPException(status_code=400, detail=f"spec.{field}: the look has no pose '{pose}'")
    users_own = {pose["id"] for pose in saved_poses if not pose.get("isDefault")} - DEFAULT_POSE_IDS
    for field, pose in _pack_poses(spec):
        if pose not in users_own:
            raise HTTPException(status_code=400, detail=f"spec.{field}: the look has no saved pose '{pose}'")


def spec_warnings(spec: Spec) -> list[str]:
    if isinstance(spec, ImageEncoding) and spec.transparent and spec.format == "jpeg":
        return ["A JPEG can't be transparent, so the cutout gets a white background. Choose PNG to keep it."]
    return []
