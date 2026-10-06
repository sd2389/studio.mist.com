"""The `convert` render job: one design of a bulk upload, from its CAD file to a GLB, a thumbnail
and what the conversion found (docs/adr/0006-bulk-pipeline.md, "Conversion jobs").

The API makes these jobs itself, one per design, when a batch is submitted (features/ingest);
POST /render-jobs never does. A worker on the CPU pool claims them, reads the payload (the spec,
and a signed GET for the source and each companion), runs the harness's convert mode on them and
uploads, under the job's prefix:

- model.glb: the converted model, binary glTF 2.0, in millimetres, decimated to `max_polygons`
  when `decimate` is "auto" (a design still over it fails with `over_polygon_cap`);
- thumbnail.webp: a `thumbnail.size` px square WebP of it. Optional: a thumbnail that fails is a
  warning, not a failed design;
- conversion.json: what the conversion found (ConversionReport in features/ingest/conversions.py).

Completing the job checks the model as a direct upload is checked and makes the design's scene.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal

from pydantic import Field

from app.config import get_settings
from app.features.billing.plans import MB
from app.features.render_jobs.job_files import PlannedOutput
from app.features.render_jobs.specs import SpecModel
from app.features.upload.thumbnails import MAX_THUMBNAIL_BYTES

MODEL_OUTPUT = "model.glb"
THUMBNAIL_OUTPUT = "thumbnail.webp"
REPORT_OUTPUT = "conversion.json"
OUTPUT_NAMES = (MODEL_OUTPUT, THUMBNAIL_OUTPUT, REPORT_OUTPUT)
OPTIONAL_OUTPUTS = frozenset({THUMBNAIL_OUTPUT})
MAX_REPORT_BYTES = 1 * MB
MAX_COMPANIONS = 8

# How a design's file gives its size: "auto" lets the converter judge; the others are for files
# that carry no unit of their own (OBJ, STL, PLY).
Units = Literal["auto", "mm", "cm", "in", "m"]


class ConvertFile(SpecModel):
    """A file the worker fetches: its private key, the name the converter sees, and its size."""

    key: str = Field(min_length=1, max_length=512)
    # The file's own name as dropped, so an OBJ finds its MTL and a glTF its .bin by name.
    filename: str = Field(min_length=1, max_length=255)
    bytes: int = Field(ge=1)


class ConvertThumbnail(SpecModel):
    size: Literal[512] = 512
    format: Literal["webp"] = "webp"


class ConvertScene(SpecModel):
    """The scene the design becomes, as its batch named it."""

    sku: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(min_length=1, max_length=128)
    note: str | None = None


class ConvertSpec(SpecModel):
    item_id: int = Field(ge=1)
    source: ConvertFile
    companions: list[ConvertFile] = Field(default_factory=list, max_length=MAX_COMPANIONS)
    units: Units = "auto"
    max_polygons: int = Field(ge=1)  # the owner's plan cap when the job was made
    decimate: Literal["auto", "fail"] = "auto"
    thumbnail: ConvertThumbnail = Field(default_factory=ConvertThumbnail)
    scene: ConvertScene


def normalised_convert_spec(spec: ConvertSpec) -> dict[str, Any]:
    """What a convert job keeps: its spec and the names of the files it makes."""
    return {**spec.model_dump(mode="json"), "output_names": list(OUTPUT_NAMES)}


def convert_outputs(spec: Mapping[str, Any]) -> list[PlannedOutput]:
    """The files a convert job makes, read from its normalised spec. The model is held to the
    direct upload's size cap."""
    size = spec["thumbnail"]["size"]
    return [
        PlannedOutput(
            name=MODEL_OUTPUT,
            render_kind="model",
            content_type="model/gltf-binary",
            max_bytes=get_settings().max_upload_bytes,
            width=None,
            height=None,
            label=None,
        ),
        PlannedOutput(
            name=THUMBNAIL_OUTPUT,
            render_kind="thumbnail",
            content_type="image/webp",
            max_bytes=MAX_THUMBNAIL_BYTES,
            width=size,
            height=size,
            label=None,
        ),
        PlannedOutput(
            name=REPORT_OUTPUT,
            render_kind="conversion",
            content_type="application/json",
            max_bytes=MAX_REPORT_BYTES,
            width=None,
            height=None,
            label=None,
        ),
    ]
