"""The `batch_archive` render job: a ZIP of every output of a bulk upload's designs, in parts
(docs/adr/0006-bulk-pipeline.md, "Results").

The API makes these jobs itself, when a batch's owner asks for its archive (features/ingest/
archive.py); POST /render-jobs never does. A worker on the CPU pool claims one, reads the payload
(the batch's manifest, and where to fetch each output and thumbnail, with the path it takes in
the archive) and streams them into ZIP parts of at most `part_bytes`, the manifest first: a file
that doesn't fit what is left of a part starts the next one, and a file larger than a part goes
in one of its own. Each part is uploaded under the job's prefix as `<stem>-part-<n>.zip`, the
first part always, at most `max_parts` of them, numbered from 1 with none left out.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

from pydantic import Field

from app.features.billing.plans import GB
from app.features.render_jobs.job_files import MAX_ZIP_BYTES, ZIP_CONTENT_TYPE, PlannedOutput
from app.features.render_jobs.specs import SpecModel

ARCHIVE_KIND = "batch_archive"
# A part holds at most 2 GB, as the ADR has it: a file larger than that goes alone, up to what
# a ZIP without ZIP64 takes.
PART_BYTES = 2 * GB
# The most parts one job uploads and completes (a complete names at most 100 outputs).
MAX_PARTS = 100
# What fflate's ZIP adds to an entry beside its bytes and its name twice (the local header, the
# data descriptor and the central header), and its end record: ZIP_ENTRY_BYTES and ZIP_END_BYTES
# in scripts/render-worker/outputs.mjs.
ZIP_ENTRY_BYTES = 30 + 16 + 46
ZIP_END_BYTES = 22
# The most the manifest takes for each design, its links included: well above any row's cells.
MANIFEST_ROW_BYTES = 8 * 1024


class ArchiveSpec(SpecModel):
    batch_id: int = Field(ge=1)
    # The parts' file stem: the batch's name, cleaned.
    stem: str = Field(min_length=1, max_length=96, pattern=r"^[A-Za-z0-9._-]+$")
    part_bytes: int = Field(ge=1024, le=MAX_ZIP_BYTES)
    max_parts: int = Field(ge=1, le=MAX_PARTS)


def zip_entry_bytes(name: str, size: int) -> int:
    """What an entry of `size` bytes under `name` adds to a part (zipEntryBytes in outputs.mjs)."""
    return size + ZIP_ENTRY_BYTES + 2 * len(name.encode())


def deflated_at_most(size: int) -> int:
    """The most deflate makes of `size` bytes of text: a part's room for the manifest
    (deflatedAtMost in scripts/render-worker/archive.mjs)."""
    return math.ceil(size * 1.01) + 1024


def parts_needed(manifest_name: str, manifest_bytes: int, files: list[tuple[str, int]], part_bytes: int = PART_BYTES) -> int:
    """How many parts the worker packs the manifest and these files (path, size) into, in order:
    its packing, mirrored (writeArchiveParts in scripts/render-worker/archive.mjs). The manifest
    opens the first part; a file that would take a part past `part_bytes` starts the next one, so
    a file larger than a part goes alone. Packing so never needs more parts when a file is smaller
    than given, so a size given as its cap (a thumbnail's) bounds the parts the real one takes."""
    parts = 1
    projected = ZIP_END_BYTES + zip_entry_bytes(manifest_name, deflated_at_most(manifest_bytes))
    for name, size in files:
        adds = zip_entry_bytes(name, size)
        if projected + adds > part_bytes:  # the part holds an entry already: the manifest, or a file
            parts += 1
            projected = ZIP_END_BYTES
        projected += adds
    return parts


def part_name(spec: Mapping[str, Any], number: int) -> str:
    return f"{spec['stem']}-part-{number}.zip"


def archive_part_names(spec: Mapping[str, Any]) -> list[str]:
    """Every part a batch_archive job may upload, in order."""
    return [part_name(spec, number) for number in range(1, spec["max_parts"] + 1)]


def archive_outputs(spec: Mapping[str, Any]) -> list[PlannedOutput]:
    """The parts a batch_archive job may make, read from its spec: ZIPs, each at most what a ZIP
    without ZIP64 takes (a part with one file larger than `part_bytes` passes it)."""
    return [
        PlannedOutput(
            name=name,
            render_kind="archive",
            content_type=ZIP_CONTENT_TYPE,
            max_bytes=MAX_ZIP_BYTES,
            width=None,
            height=None,
            label=None,
        )
        for name in archive_part_names(spec)
    ]
