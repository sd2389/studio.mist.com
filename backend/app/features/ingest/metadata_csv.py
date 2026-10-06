"""The CSV manifest a batch can come with: a row per design, naming its file and giving its SKU,
name, category, note and units (docs/adr/0006-bulk-pipeline.md, "Uploading in bulk").

UTF-8, at most 1 MB, with a header row; only `file` is required. A row finds its design by the
file's relative path, else by a file name only one of the batch's files has, either way without
regard to case. Every problem is reported with its row, the header being row 1.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from pathlib import PurePosixPath

from app.schemas.ingest import MAX_REQUEST_DESIGNS, IngestProblem

COLUMNS = ("file", "sku", "name", "category", "note", "units")
MAX_MANIFEST_BYTES = 1024 * 1024


@dataclass(frozen=True)
class ManifestRow:
    row: int  # its number, the header being row 1
    cells: dict[str, str]  # by column, stripped; blank cells left out


def _problem(row: int | None, field: str, code: str, message: str, item: int | None = None) -> IngestProblem:
    return IngestProblem(item=item, row=row, field=field, code=code, message=message)


def _read_records(text: str) -> tuple[list[list[str]], IngestProblem | None]:
    if len(text.encode("utf-8")) > MAX_MANIFEST_BYTES:
        return [], _problem(None, "manifest", "manifest_too_large", "The manifest is larger than 1 MB.")
    try:
        records = list(csv.reader(io.StringIO(text.removeprefix("﻿"))))
    except csv.Error as exc:
        return [], _problem(None, "manifest", "manifest_unreadable", f"The manifest isn't a CSV file: {exc}.")
    if not records or not any(cell.strip() for cell in records[0]):
        return [], _problem(1, "manifest", "manifest_empty", "The manifest has no header row.")
    return records, None


def _unknown_column(name: str) -> IngestProblem:
    message = f"'{name}' is not a column" if name else "A column has no name"
    return _problem(1, name or "manifest", "column_unknown", f"{message}: the columns are {', '.join(COLUMNS)}.")


def _header_problems(header: list[str]) -> list[IngestProblem]:
    problems = [_unknown_column(name) for name in header if name not in COLUMNS]
    problems += [
        _problem(1, name, "column_repeated", f"The header names {name} twice.")
        for name in sorted({name for name in header if name in COLUMNS and header.count(name) > 1})
    ]
    if "file" not in header:
        problems.append(_problem(1, "file", "column_missing", "The header has no file column."))
    return problems


def parse_manifest(text: str) -> tuple[list[ManifestRow], list[IngestProblem]]:
    """The manifest's rows that name a file, and the problems with the rest. Blank lines are
    skipped; a header the columns don't match keeps any row from being read."""
    records, unreadable = _read_records(text)
    if unreadable is not None:
        return [], [unreadable]
    header = [cell.strip().lower() for cell in records[0]]
    if problems := _header_problems(header):
        return [], problems
    data = [(number, cells) for number, cells in enumerate(records[1:], start=2) if any(cell.strip() for cell in cells)]
    if len(data) > MAX_REQUEST_DESIGNS:
        return [], [_problem(None, "manifest", "manifest_too_long", f"The manifest has {len(data)} rows; at most {MAX_REQUEST_DESIGNS}.")]
    rows: list[ManifestRow] = []
    for number, cells in data:
        if len(cells) > len(header):
            problems.append(_problem(number, "manifest", "row_too_long", f"The row has {len(cells)} cells for {len(header)} columns."))
            continue
        # A row may stop short of the header's last columns: those cells are blank.
        values = {column: cell.strip() for column, cell in zip(header, cells, strict=False) if cell.strip()}
        if "file" not in values:
            problems.append(_problem(number, "file", "file_missing", "The row names no file."))
            continue
        rows.append(ManifestRow(number, values))
    return rows, problems


def _normalised(path: str) -> str:
    """A path as rows and files are matched: forward slashes, no leading ./ or /, any case."""
    path = path.strip().replace("\\", "/")
    while path.startswith("./"):
        path = path[2:]
    return path.lstrip("/").casefold()


def match_rows(filenames: list[str], rows: list[ManifestRow]) -> tuple[dict[int, ManifestRow], list[IngestProblem]]:
    """Each design's row, by the design's index: the row naming its relative path, else its file
    name when only one design has that name; and the problems with rows that find none, or one
    another row found first."""
    by_path = {_normalised(name): index for index, name in enumerate(filenames)}
    by_name: dict[str, list[int]] = {}
    for index, name in enumerate(filenames):
        by_name.setdefault(PurePosixPath(_normalised(name)).name, []).append(index)
    matched: dict[int, ManifestRow] = {}
    problems: list[IngestProblem] = []
    for row in rows:
        wanted = _normalised(row.cells["file"])
        index = by_path.get(wanted)
        if index is None:
            named = by_name.get(PurePosixPath(wanted).name, [])
            if len(named) > 1:
                message = f"{len(named)} files are named {PurePosixPath(wanted).name}: give the file's folders too."
                problems.append(_problem(row.row, "file", "file_ambiguous", message))
                continue
            index = named[0] if named else None
        if index is None:
            problems.append(_problem(row.row, "file", "file_not_in_batch", f"No file of the batch is {row.cells['file']}."))
        elif index in matched:
            message = f"Row {matched[index].row} is {filenames[index]}'s row already."
            problems.append(_problem(row.row, "file", "file_listed_twice", message, item=index))
        else:
            matched[index] = row
    return matched, problems
