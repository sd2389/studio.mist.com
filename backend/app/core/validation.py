"""The 400 detail for a request part that fails its Pydantic model."""

from pydantic import ValidationError


def validation_detail(exc: ValidationError, root: str) -> str:
    """The first error, named by its field under `root`: 'spec.cameras[2].angle: Input should be …'."""
    error = exc.errors()[0]
    path = root
    for part in error["loc"]:
        path += f"[{part}]" if isinstance(part, int) else f".{part}"
    return f"{path}: {error['msg'].removeprefix('Value error, ')}"
