"""What a render job makes, read from its spec (docs/adr/0005-server-exports.md).

The names of its files, cleaned from the request's name; the normalised spec the job keeps, with
its frame count and those names; and each file's type and size cap, which uploads and complete
check, with the size of the frames it renders.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.features.render_jobs.specs import (
    SPEC_MODELS,
    Camera,
    Spec,
    SpinSpec,
    StillSpec,
    TurntableSpec,
    spec_cameras,
)

MAX_NAME_LENGTH = 96

_UNSAFE_NAME_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


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
