"""What a Campaign Pack renders, from its config (docs/adr/0005-server-exports.md, "campaign_pack").

The pack's own tables (src/features/render/campaign-pack/domain/defaults.ts), and its config
expanded as the browser's planCampaignPack expands it (domain/plan.ts): for every metal, a still
from every angle in each format asked for, its spin, and a turntable in each video format; and
the ASET image once a pack. Its price, its plan limits, its frame count and its longest side are
all read from these parts.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from app.services.model_config import METAL_PRESETS

# PACK_STILL_SIZES and TURNTABLE_FORMATS in domain/defaults.ts.
PACK_STILL_SIZES = (1000, 2000, 3000, 4000)
PackVideoFormat = Literal["landscape", "square", "vertical"]
PACK_VIDEO_SIZES: dict[str, tuple[int, int]] = {
    "landscape": (1920, 1080),
    "square": (1080, 1080),
    "vertical": (1080, 1920),
}
# Every metal preset the studio ships (PACK_METAL_OPTIONS), and the model as configured.
PACK_METALS = frozenset({preset for preset, _label in METAL_PRESETS} | {"current"})
# A saved pose as one of the pack's angles: "pose:<id>" (domain/angles.ts).
POSE_ANGLE_PREFIX = "pose:"
# At most this many metals and angles a pack (ADR 0005, "Security and limits").
MAX_PACK_METALS = 8
MAX_PACK_ANGLES = 8


@dataclass(frozen=True)
class PackPart:
    """One thing a pack renders: a still or the ASET image (one file each), a spin or a turntable."""

    kind: Literal["still", "scope", "spin", "turntable"]
    width: int
    height: int
    frames: int = 1
    fps: int = 0  # a turntable's


def pack_parts(config: Mapping[str, Any]) -> list[PackPart]:
    """Everything a pack's config renders, read from the config or a job's normalised spec.

    The ASET image is the pack's one: whether the piece has ray-traced gems to draw it from is
    only known where it renders, so the config's `cutScope` stands for it.
    """
    metals = len(config["metals"])
    size = config["stillSize"]
    formats = sum(1 for asked in (config["formats"]["jpg"], config["formats"]["png"]) if asked)
    parts = [PackPart("still", size, size)] * (metals * len(config["angleIds"]) * formats)
    if config["cutScope"]:
        parts.append(PackPart("scope", size, size))
    spin = config["spin"]
    if spin["enabled"]:
        parts += [PackPart("spin", spin["size"], spin["size"], frames=spin["frames"])] * metals
    turntable = config["turntable"]
    if turntable["enabled"]:
        frames = turntable["durationSec"] * turntable["fps"]
        for video_format in turntable["formats"]:
            width, height = PACK_VIDEO_SIZES[video_format]
            parts += [PackPart("turntable", width, height, frames=frames, fps=turntable["fps"])] * metals
    return parts
