"""A new batch's designs, as its create request gives them (docs/adr/0006-bulk-pipeline.md,
"Uploading in bulk", "Limits for batches" and "SKUs").

Each CAD file and companion is checked; with a CSV manifest, each design's row is found; and its
SKU, name, category, note and units are settled from its row, else from its item, else from its
file name, as the upload page names a model. Every problem is reported at once, by the item (its
index in the request) and the row it is about, so a 500-row manifest is checked in one call.
SKUs are checked last: their form, against each other, and against the platform, where a scene
holds a SKU and a design in progress reserves one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath

from sqlalchemy.orm import Session

from app.features.billing.plans import MB, BatchLimits
from app.features.ingest.metadata_csv import ManifestRow, match_rows, parse_manifest
from app.features.scene.skus import sku_holders
from app.features.upload.service import SUPPORTED_MODEL_SUFFIXES
from app.schemas.ingest import IngestFileIn, IngestItemIn, IngestProblem

# Mirrors JEWELRY_CATEGORIES in src/lib/upload/categories.ts.
JEWELRY_CATEGORIES = (
    "Ring", "Engagement Ring", "Wedding Band", "Necklace", "Pendant", "Earrings", "Stud Earrings",
    "Hoop Earrings", "Bracelet", "Bangle", "Anklet", "Brooch", "Cufflinks", "Watch", "Other",
)
_CATEGORIES = {category.casefold(): category for category in JEWELRY_CATEGORIES}
SKU_FORM = re.compile(r"[A-Za-z0-9._-]{1,64}")
UNITS = ("auto", "mm", "cm", "in", "m")
# Formats whose files carry no unit of their own, so a design may say what its numbers measure.
UNITLESS_SUFFIXES = frozenset({".obj", ".stl", ".ply"})
# A companion file, and the format it goes with: an OBJ's materials, a glTF's buffers.
COMPANION_FOR = {".mtl": ".obj", ".bin": ".gltf"}
METADATA_FIELDS = ("sku", "name", "category", "note", "units")
MAX_NAME_LENGTH = 255
MAX_NOTE_LENGTH = 4096
MAX_FILE_NAME_LENGTH = 255
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
_CONTROL_IN_TEXT = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")  # all but tabs and line breaks


@dataclass(frozen=True)
class DesignFile:
    filename: str  # its relative path, as dropped
    bytes: int


@dataclass(frozen=True)
class Design:
    """A design of a new batch, every field settled."""

    position: int  # its index in the request
    row: int | None  # its manifest row
    source: DesignFile
    companions: tuple[DesignFile, ...]
    sku: str
    name: str
    category: str
    note: str | None
    units: str


def file_name(path: str) -> str:
    """A dropped file's own name, without its folders."""
    return PurePosixPath(path).name


def _suffix(path: str) -> str:
    return PurePosixPath(path).suffix.lower()


def stem_from_filename(filename: str) -> str:
    """The name the upload page gives a model (stemFromFilename in src/lib/upload/metadata-from-filename.ts)."""
    base = re.sub(r"^.*[/\\]", "", filename)
    return re.sub(r"\.[^.]+$", "", base).strip() or "Untitled"


def sku_from_filename(filename: str) -> str:
    """The SKU the upload page gives a model (skuFromFilename in the same file)."""
    sanitized = re.sub(r"[^a-zA-Z0-9._-]+", "-", stem_from_filename(filename))
    return re.sub(r"^-+|-+$", "", sanitized)[:64] or "MODEL-001"


def known_category(value: str) -> str | None:
    """A category, in the case the studio writes it; None when it is not one."""
    return _CATEGORIES.get(value.strip().casefold())


def name_problem(name: str) -> str | None:
    """Why a design's or a batch's name can't be kept; None when it can."""
    if len(name) > MAX_NAME_LENGTH or _CONTROL_CHARACTERS.search(name):
        return f"A name is at most {MAX_NAME_LENGTH} characters, on one line."
    return None


def _path_problem(path: str) -> str | None:
    """Why a dropped file's path can't be kept; None when it can: a relative path of named
    folders, without backslashes or control characters."""
    if _CONTROL_CHARACTERS.search(path) or "\\" in path:
        return "has a backslash or a control character in it"
    if path.startswith("/") or any(part in ("", ".", "..") for part in path.split("/")):
        return "is not a relative path"
    if len(file_name(path)) > MAX_FILE_NAME_LENGTH:
        return f"has a file name longer than {MAX_FILE_NAME_LENGTH} characters"
    return None


class _Report:
    """The problems found, each named by its item and its manifest row."""

    def __init__(self) -> None:
        self.problems: list[IngestProblem] = []

    def add(self, item: int | None, row: int | None, field: str, code: str, message: str) -> None:
        self.problems.append(IngestProblem(item=item, row=row, field=field, code=code, message=message))


def _check_file(report: _Report, item: int, field: str, file: IngestFileIn | IngestItemIn, limits: BatchLimits) -> bool:
    """Whether a file can be uploaded: a relative path, not empty, within the size limit."""
    before = len(report.problems)
    if reason := _path_problem(file.filename):
        report.add(item, None, f"{field}filename", "filename_invalid", f"{file.filename!r} {reason}.")
    if file.bytes < 1:
        report.add(item, None, f"{field}bytes", "file_empty", f"{file_name(file.filename)} is empty.")
    elif file.bytes > limits.max_file_bytes:
        message = f"{file_name(file.filename)} is {file.bytes:,} bytes; a file may be at most {limits.max_file_bytes // MB} MB."
        report.add(item, None, f"{field}bytes", "file_too_large", message)
    return len(report.problems) == before


def _check_files(report: _Report, index: int, item: IngestItemIn, limits: BatchLimits) -> bool:
    """Whether a design's CAD file and companions can be uploaded and converted together."""
    ok = _check_file(report, index, "", item, limits)
    suffix = _suffix(item.filename)
    if suffix not in SUPPORTED_MODEL_SUFFIXES:
        formats = ", ".join(known.lstrip(".") for known in SUPPORTED_MODEL_SUFFIXES)
        report.add(index, None, "filename", "format_unsupported", f"{file_name(item.filename)} is not a {formats} file.")
        ok = False
    names = {file_name(item.filename).casefold()}
    for number, companion in enumerate(item.companions):
        field = f"companions[{number}]."
        ok = _check_file(report, index, field, companion, limits) and ok
        goes_with = COMPANION_FOR.get(_suffix(companion.filename))
        if goes_with != suffix:
            reason = "is not an MTL or a .bin file" if goes_with is None else f"goes with a {goes_with} file"
            report.add(index, None, f"{field}filename", "companion_unsupported", f"{file_name(companion.filename)} {reason}.")
            ok = False
        if file_name(companion.filename).casefold() in names:
            message = f"Another file of this design is named {file_name(companion.filename)}."
            report.add(index, None, f"{field}filename", "companion_repeated", message)
            ok = False
        names.add(file_name(companion.filename).casefold())
    return ok


def _settle(report: _Report, index: int, item: IngestItemIn, row: ManifestRow | None, category: str) -> Design | None:
    """The design with its SKU, name, category, note and units: from its row, else its item,
    else its file name and the batch's category. None when any of them can't be kept."""
    given = row.cells if row is not None else {field: getattr(item, field) for field in METADATA_FIELDS}
    row_number = row.row if row is not None else None
    before = len(report.problems)

    def refuse(field: str, code: str, message: str) -> None:
        report.add(index, row_number, field, code, message)

    # A SKU or a name taken from a file name is a good one once the file name is.
    sku = (given.get("sku") or "").strip() or sku_from_filename(item.filename)
    if not SKU_FORM.fullmatch(sku):
        refuse("sku", "sku_invalid", f"{sku!r} is not a SKU: 1 to 64 letters, digits, dots, hyphens or underscores.")
    name = (given.get("name") or "").strip()
    if name and (reason := name_problem(name)):
        refuse("name", "name_invalid", reason)
    if named := (given.get("category") or "").strip():
        category = known_category(named) or ""
        if not category:
            refuse("category", "category_unknown", f"{named!r} is not a category: {', '.join(JEWELRY_CATEGORIES)}.")
    note = (given.get("note") or "").strip() or None
    if note is not None and (len(note) > MAX_NOTE_LENGTH or _CONTROL_IN_TEXT.search(note)):
        refuse("note", "note_invalid", f"A note is at most {MAX_NOTE_LENGTH} characters, of text and line breaks.")
    units = (given.get("units") or "").strip().lower() or "auto"
    if units not in UNITS:
        refuse("units", "units_unknown", f"{units!r} is not a unit: {', '.join(UNITS)}.")
    elif units != "auto" and _suffix(item.filename) not in UNITLESS_SUFFIXES:
        message = f"{file_name(item.filename)} gives its own units; units are for OBJ, STL and PLY files."
        refuse("units", "units_not_needed", message)
    if len(report.problems) > before:
        return None
    return Design(
        position=index,
        row=row_number,
        source=DesignFile(item.filename, item.bytes),
        companions=tuple(DesignFile(companion.filename, companion.bytes) for companion in item.companions),
        sku=sku,
        name=name or stem_from_filename(item.filename),
        category=category,
        note=note,
        units=units,
    )


def _manifest_rows(report: _Report, items: list[IngestItemIn], manifest: str) -> dict[int, ManifestRow]:
    """Each design's manifest row, by its index. With a manifest, the items give files only."""
    rows, problems = parse_manifest(manifest)
    report.problems += problems
    matched, problems = match_rows([item.filename for item in items], rows)
    report.problems += problems
    for index, item in enumerate(items):
        if any(getattr(item, field) not in (None, "") for field in METADATA_FIELDS):
            message = "With a manifest, a design's SKU, name, category, note and units come from its row."
            report.add(index, None, "item", "metadata_twice", message)
    return matched


def plan_designs(
    items: list[IngestItemIn], manifest: str | None, category: str, limits: BatchLimits
) -> tuple[list[Design], list[IngestProblem]]:
    """The designs a create request names, and every problem that keeps any of them out."""
    report = _Report()
    batch_category = known_category(category)
    if batch_category is None:
        report.add(None, None, "options.default_category", "category_unknown", f"{category!r} is not a category.")
    rows = _manifest_rows(report, items, manifest) if manifest is not None else {}
    paths: dict[str, int] = {}
    designs: list[Design] = []
    for index, item in enumerate(items):
        files_ok = _check_files(report, index, item, limits)
        first = paths.setdefault(item.filename.casefold(), index)
        if first != index:
            report.add(index, None, "filename", "filename_repeated", f"Item {first} is {item.filename} already.")
            files_ok = False
        design = _settle(report, index, item, rows.get(index), batch_category or JEWELRY_CATEGORIES[0])
        if design is not None and files_ok:
            designs.append(design)
    return designs, report.problems


def sku_problems(db: Session, designs: list[Design]) -> list[IngestProblem]:
    """A SKU two designs share, one a scene holds, or one a design in progress reserves."""
    report = _Report()
    first: dict[str, Design] = {}
    for design in designs:
        other = first.setdefault(design.sku, design)
        if other is not design:
            report.add(design.position, design.row, "sku", "sku_repeated", f"{design.sku} is item {other.position}'s SKU too.")
    for sku, holder in sku_holders(db, first).items():
        design = first[sku]
        message = f"{sku} is a scene's SKU already." if holder == "taken" else f"{sku} is reserved by a bulk upload in progress."
        report.add(design.position, design.row, "sku", f"sku_{holder}", message)
    return report.problems
