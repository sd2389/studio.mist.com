"""Normalize viewer id / model key strings to storage lookup keys."""

import re

_CUSTOMER_MODEL_RE = re.compile(r"^customers/\d+/models/")


def normalized_model_key(viewer_id: str) -> str:
    trimmed = viewer_id.strip().lstrip("/")
    if _CUSTOMER_MODEL_RE.match(trimmed) or trimmed.startswith("models/"):
        return trimmed
    return f"models/{trimmed}"


def viewer_id_from_model_key(model_key: str) -> str:
    trimmed = model_key.strip().lstrip("/")
    if _CUSTOMER_MODEL_RE.match(trimmed):
        return trimmed.split("/models/", 1)[1]
    if trimmed.startswith("models/"):
        return trimmed[len("models/") :]
    return trimmed
