"""What each plan lets a render job be (docs/adr/0005-server-exports.md, "Plans"): a video's frame
rate and length, the shorter length of 8K, and a spin's frames and size. The longest side of a
frame is the plan's max_image_resolution, as for stills."""

import pytest

from app.features.render_jobs.plan_limits import is_8k_video, plan_refusal
from app.features.render_jobs.specs import parse_spec

VIEW = {"view": {"position": [0.62, 0.88, 2.25], "target": [0, 0, 0]}}


def _turntable(**changes):
    return parse_spec(
        "turntable", {"width": 1920, "height": 1080, "fps": 30, "frames": 120, "path": {"orbit": {"start": VIEW}}, **changes}
    )


def _spin(**changes):
    return parse_spec("spin", {"frames": 72, "size": 1080, **changes})


@pytest.mark.parametrize(
    ("tier", "spec"),
    [
        ("free", _turntable(frames=600)),  # 20 s at 30 fps
        ("free", _turntable(fps=24, frames=480)),
        ("free", _turntable(width=3840, height=2160, frames=600)),  # 4K
        ("free", _spin()),  # 72 frames at 1080 px
        ("grow", _turntable(fps=60, frames=3600)),  # a minute at 60 fps
        ("grow", _turntable(width=7680, height=4320, fps=60, frames=1200)),  # 8K for 20 s
        ("grow", _spin(frames=144, size=2048)),
        ("studio", _turntable(width=7680, height=4320, frames=600)),
        ("studio", _spin(frames=144, size=2048)),
    ],
)
def test_what_each_plan_renders(tier, spec):
    assert plan_refusal(tier, spec) is None


@pytest.mark.parametrize(
    ("tier", "spec", "detail"),
    [
        ("free", _turntable(fps=31), "Frame rate limit exceeded for Free (max 30 fps)."),
        ("free", _turntable(fps=60, frames=600), "Frame rate limit exceeded for Free (max 30 fps)."),
        ("free", _turntable(frames=601), "Video length limit exceeded for Free (max 20 s)."),
        ("free", _turntable(fps=24, frames=481), "Video length limit exceeded for Free (max 20 s)."),
        (
            "free",
            _turntable(width=4096, height=2160),
            "8K video (above 8.3 megapixels a frame) is part of Grow and Studio, not Free.",
        ),
        ("grow", _turntable(width=7680, height=4320, frames=601), "Video length limit exceeded for Grow (max 20 s at 8K)."),
        ("grow", _turntable(width=7680, height=4320, fps=60, frames=3600), "Video length limit exceeded for Grow (max 20 s at 8K)."),
        ("studio", _turntable(frames=1801), "Video length limit exceeded for Studio (max 60 s)."),
        ("free", _spin(frames=73), "Spin frame limit exceeded for Free (max 72 frames)."),
        ("free", _spin(size=1081), "Spin size limit exceeded for Free (max 1080 px)."),
    ],
)
def test_what_each_plan_refuses(tier, spec, detail):
    assert plan_refusal(tier, spec) == detail


def test_a_still_has_no_limit_but_its_size():
    assert plan_refusal("free", parse_spec("still", {"camera": VIEW, "width": 4096, "height": 4096})) is None


def test_8k_is_what_the_credit_table_prices_as_8k():
    assert not is_8k_video(3840, 2160)  # 8.29 MP
    assert is_8k_video(4096, 2160)  # 8.85 MP
    assert is_8k_video(7680, 4320)
