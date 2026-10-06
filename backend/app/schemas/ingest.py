"""Bulk ingest: batches of designs uploaded as CAD files (docs/adr/0006-bulk-pipeline.md)."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.utc import UTCDateTime

# The most designs or SKUs one request may name, whatever the plan: twice the largest batch.
MAX_REQUEST_DESIGNS = 1000
# The most designs one call signs uploads for, or confirms.
MAX_ITEMS_A_CALL = 100

ItemStatus = Literal[
    "awaiting_upload", "uploaded", "converting", "converted", "rendering", "done", "failed", "skipped", "canceled",
]


class IngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class IngestFileIn(IngestRequest):
    """A companion file of a design: an OBJ's MTL, a glTF's .bin."""

    filename: str = Field(min_length=1, max_length=512)  # its relative path, as dropped
    bytes: int = Field(ge=0)


class IngestItemIn(IngestRequest):
    """One design: its CAD file and companions, and what to call it. Without a manifest, what an
    item leaves out comes from its file name; with one, from its row."""

    filename: str = Field(min_length=1, max_length=512)  # its relative path, as dropped
    bytes: int = Field(ge=0)
    companions: list[IngestFileIn] = Field(default_factory=list, max_length=8)
    sku: str | None = Field(default=None, max_length=128)
    name: str | None = Field(default=None, max_length=255)
    category: str | None = Field(default=None, max_length=128)
    note: str | None = Field(default=None, max_length=4096)
    units: str | None = Field(default=None, max_length=8)


class IngestOptions(IngestRequest):
    # Over the plan's polygon cap: decimate the metal ("auto"), or fail the design ("fail").
    decimate: Literal["auto", "fail"] = "auto"
    default_category: str = Field(default="Ring", max_length=128)


class IngestBatchCreate(IngestRequest):
    name: str = Field(min_length=1, max_length=255)
    items: list[IngestItemIn] = Field(min_length=1, max_length=MAX_REQUEST_DESIGNS)
    # The CSV manifest, UTF-8, at most 1 MB: file,sku,name,category,note,units; only file is required.
    manifest: str | None = Field(default=None, max_length=1024 * 1024)
    # The stills each design gets once converted; checked by render_plans.py (400 naming the field).
    render_plan: dict[str, Any] | None = None
    options: IngestOptions = Field(default_factory=IngestOptions)


class IngestProblem(BaseModel):
    """Why a batch can't be made: the item (its index in the request) and the CSV row (the header
    is row 1) it is about, the field, a code and the reason."""

    item: int | None = None
    row: int | None = None
    field: str
    code: str
    message: str


class IngestCredits(BaseModel):
    model_credits: int
    render_credits: int


class IngestCompanionOut(BaseModel):
    filename: str
    bytes: int


class IngestItemOut(BaseModel):
    id: int
    batch_id: int
    position: int
    filename: str
    bytes: int
    companions: list[IngestCompanionOut]
    sku: str
    name: str
    category: str
    note: str | None
    units: str
    status: str
    error: str | None
    error_code: str | None
    attempts: int
    scene_id: int | None
    convert_job_id: int | None
    model_credit_held: int
    render_credits_held: int
    polygon_count: int | None
    size_mm: float | None
    warnings: list[str]
    created_at: UTCDateTime
    updated_at: UTCDateTime


class IngestBatchOut(BaseModel):
    """A batch, with how many of its designs are at each status."""

    id: int
    name: str
    status: str
    source: str
    item_count: int
    total_bytes: int
    counts: dict[str, int]
    render_plan: dict[str, Any] | None
    options: dict[str, Any]
    # What the whole batch costs: a model credit and the render plan's credits for each design.
    quote: IngestCredits
    # What its designs hold now, not yet spent or given back.
    held: IngestCredits
    created_at: UTCDateTime
    updated_at: UTCDateTime
    submitted_at: UTCDateTime | None
    finished_at: UTCDateTime | None
    expires_at: UTCDateTime | None


class IngestBatchCreated(IngestBatchOut):
    items: list[IngestItemOut]


class IngestBatchPage(BaseModel):
    items: list[IngestBatchOut]
    total: int
    page: int
    limit: int


class IngestItemPage(BaseModel):
    items: list[IngestItemOut]
    total: int
    page: int
    limit: int


class IngestItemIds(IngestRequest):
    item_ids: list[int] = Field(min_length=1, max_length=MAX_ITEMS_A_CALL)


class IngestUpload(BaseModel):
    """One signed PUT: send the file with exactly these headers, which the URL signs."""

    item_id: int
    filename: str  # as the item names it
    url: str
    method: Literal["PUT"] = "PUT"
    headers: dict[str, str]


class IngestUploads(BaseModel):
    files: list[IngestUpload]
    expires_in: int


class IngestUploadMissing(BaseModel):
    item_id: int
    message: str


class IngestUploaded(BaseModel):
    """The designs confirmed, and those whose files aren't all stored at their declared sizes yet."""

    items: list[IngestItemOut]
    missing: list[IngestUploadMissing]


class IngestRefusal(BaseModel):
    item_id: int
    code: str
    message: str


class IngestRetried(BaseModel):
    batch: IngestBatchOut
    retried: list[int]
    refused: list[IngestRefusal]


class IngestSkuCheck(IngestRequest):
    skus: list[Annotated[str, Field(max_length=128)]] = Field(min_length=1, max_length=MAX_REQUEST_DESIGNS)


class IngestSkuCheckOut(BaseModel):
    """The SKUs a scene holds, and those a design in progress reserves; the others are free."""

    taken: list[str]
    reserved: list[str]
