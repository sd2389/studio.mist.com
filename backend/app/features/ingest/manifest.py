"""A batch's manifest: one CSV row per design, built from the database on every request, so it is
always current (docs/adr/0006-bulk-pipeline.md, "Results").

Each row gives the design's SKU, name, category and status, its embed link, a link to its
thumbnail and to each of its outputs (a still per angle, the turntable, the spin), and why it
failed. The links are the files' public copies when the batch publishes media; otherwise the
studio's own links, which open only for their signed-in owner. The embed link is public either
way: it is the piece's page. A cell that a spreadsheet would read as a formula gets a leading `'`.
"""

from __future__ import annotations

import csv
import io

from sqlalchemy.orm import Session

from app.features.ingest.results import (
    SPIN_COLUMN,
    THUMBNAIL_COLUMN,
    TURNTABLE_COLUMN,
    DesignResult,
    design_results,
    still_column,
)
from app.features.render_jobs.job_files import output_stem
from app.models import IngestBatch

MANIFEST_NAME = "manifest.csv"
# Every still angle a plan can render (PackAngle), so the columns are the same for every batch.
STILL_ANGLES = ("front", "three-quarter", "side", "top")
COLUMNS = (
    "sku",
    "name",
    "category",
    "status",
    "embed_url",
    THUMBNAIL_COLUMN,
    *(still_column(angle) for angle in STILL_ANGLES),
    TURNTABLE_COLUMN,
    SPIN_COLUMN,
    "error",
)
# What a spreadsheet takes for the start of a formula, or of a cell it splits.
_FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")


def formula_safe(value: str) -> str:
    """The cell as text, with a leading `'` when it starts as a formula would, so a design named
    `=HYPERLINK(…)` shows as typed instead of running."""
    return f"'{value}" if value.startswith(_FORMULA_STARTS) else value


def _error_cell(result: DesignResult) -> str:
    item = result.item
    if item.error_code and item.error:
        return f"{item.error_code}: {item.error}"
    return item.error or item.error_code or ""


def manifest_row(result: DesignResult) -> list[str]:
    """A design's cells, in COLUMNS' order, each formula-safe."""
    item = result.item
    cells = {
        "sku": item.sku,
        "name": item.name,
        "category": item.category,
        "status": item.status,
        "embed_url": (item.embed_url or "") if result.scene is not None else "",
        "error": _error_cell(result),
    }
    for file in result.files:
        if file.column is not None and file.link:
            cells.setdefault(file.column, file.link)
    return [formula_safe(cells.get(column, "")) for column in COLUMNS]


def manifest_csv(db: Session, batch: IngestBatch) -> str:
    """The batch's manifest as CSV: a header, then a row per design in the order dropped."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(COLUMNS)
    writer.writerows(manifest_row(result) for result in design_results(db, batch))
    return buffer.getvalue()


def manifest_filename(batch: IngestBatch) -> str:
    """What the download is saved as: the batch's name, cleaned, then `-manifest.csv`."""
    return f"{output_stem(batch.name, f'batch-{batch.id}')}-manifest.csv"
