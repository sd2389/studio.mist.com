"""Campaign Pack configs as the studio's dialog sends them."""

import copy

# DEFAULT_CAMPAIGN_PACK_CONFIG (src/features/render/campaign-pack/domain/defaults.ts), for a
# scene with a SKU. It costs 49 credits.
DEFAULT_PACK = {
    "metals": ["gold-18k-yellow", "gold-18k-white", "gold-18k-rose"],
    "angleIds": ["front", "three-quarter", "top", "side"],
    "stillSize": 2000,
    "formats": {"jpg": True, "png": True},
    "background": {"kind": "white"},
    "jpegQuality": 0.95,
    "autoFrame": True,
    "marginPct": 8,
    "contactShadow": True,
    "turntable": {"enabled": True, "formats": ["landscape", "square"], "durationSec": 10, "fps": 30},
    "spin": {"enabled": True, "frames": 72, "size": 1080},
    "embed": True,
    "cutScope": True,
}


def pack(**changes) -> dict:
    """The default pack with some fields changed; a dict changes the fields it names inside one."""
    config = copy.deepcopy(DEFAULT_PACK)
    for field, value in changes.items():
        config[field] = {**config[field], **value} if isinstance(value, dict) else value
    return config
