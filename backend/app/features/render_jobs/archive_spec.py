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

from app.features.billing.plans import GB, MB
from app.features.render_jobs.job_files import MAX_ZIP_BYTES, ZIP_CONTENT_TYPE, PlannedOutput
from app.features.render_jobs.specs import SpecModel

ARCHIVE_KIND = "batch_archive"
# A part holds at most 2 GB, as the ADR has it: a file larger than that goes alone, up to what
# a ZIP without ZIP64 takes.
PART_BYTES = 2 * GB
# The most parts one job uploads and completes (a complete names at most 100 outputs).
MAX_PARTS = 100
# What a ZIP adds to an entry beside its bytes: headers, data descriptor and its name twice, ample.
ENTRY_OVERHEAD_BYTES = 1024
# What the manifest takes at most for each design, its links included.
MANIFEST_ROW_BYTES = 8 * 1024


class ArchiveSpec(SpecModel):
    batch_id: int = Field(ge=1)
    # The parts' file stem: the batch's name, cleaned.
    stem: str = Field(min_length=1, max_length=96, pattern=r"^[A-Za-z0-9._-]+$")
    part_bytes: int = Field(ge=1 * MB, le=MAX_ZIP_BYTES)
    max_parts: int = Field(ge=1, le=MAX_PARTS)


def parts_needed(file_bytes: list[int], part_bytes: int = PART_BYTES) -> int:
    """The most parts files of these sizes can take as the worker packs them. A part closes only
    when the next file doesn't fit, so two parts in a row hold more than `part_bytes` together:
    k parts hold more than ⌊k/2⌋ parts' worth."""
    total = sum(file_bytes) + ENTRY_OVERHEAD_BYTES * len(file_bytes)
    return 2 * math.ceil(total / part_bytes) + 1


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
