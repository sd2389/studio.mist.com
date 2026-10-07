"""Bulk ingest: batches of designs uploaded as CAD files (docs/adr/0006-bulk-pipeline.md)."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.render_job import RenderJobOutput
from app.schemas.scene import SceneLook
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
    # What each design is rendered as once converted: stills, a turntable, a spin; checked by
    # render_plans.py (400 naming the field, 402 past the plan's caps). None renders nothing.
    render_plan: dict[str, Any] | None = None
    # One of the owner's look templates (404 for any other), which each design's scene takes; the
    # batch keeps a copy, checked again. None: the studio's default look.
    look_template_id: int | None = Field(default=None, ge=1)
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


class IngestItemJob(BaseModel):
    """One of a design's render jobs, as its batch's page follows it: the newest of each kind,
    with what it made. GET /render-jobs/{id} has the rest of it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    status: str
    progress: float
    stage: str | None
    attempts: int
    max_attempts: int
    error: str | None
    error_code: str | None
    credits: int
    credit_state: str
    cancel_requested_at: UTCDateTime | None
    outputs: list[RenderJobOutput] = Field(default_factory=list)


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
    # The piece's embed link once its scene holds its SKU, and the scene's thumbnail.
    embed_url: str | None = None
    thumbnail_url: str | None = None
    # Its render jobs, the newest of each kind, once its scene is made.
    jobs: list[IngestItemJob] = Field(default_factory=list)
    created_at: UTCDateTime
    updated_at: UTCDateTime


class IngestArchivePart(BaseModel):
    """One ZIP part of a batch's archive; its download is a short-lived signed link."""

    part: int  # from 1
    name: str
    bytes: int
    files: int | None  # how many files it holds, the first part's manifest included
    download_url: str  # /ingest/batches/{id}/archive/{part}


class IngestArchiveOut(BaseModel):
    """A batch's archive: the newest job that builds it, with its status and progress, and the
    parts the last one to complete made, until they expire."""

    job: IngestItemJob | None
    parts: list[IngestArchivePart]
    made_at: UTCDateTime | None
    expires_at: UTCDateTime | None


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
    # The look template its designs' scenes take, as it was when the batch was made.
    look_template: dict[str, Any] | None
    options: dict[str, Any]
    # What the whole batch costs: a model credit and the render plan's credits for each design.
    quote: IngestCredits
    # What its designs and their render jobs hold now, not yet spent or given back.
    held: IngestCredits
    # Spent: a model credit a scene made, and what its completed render jobs charged.
    charged: IngestCredits
    # Given back: what its designs got back when they failed or were canceled, and its jobs' refunds.
    refunded: IngestCredits
    created_at: UTCDateTime
    updated_at: UTCDateTime
    submitted_at: UTCDateTime | None
    finished_at: UTCDateTime | None
    # When its raw CAD files are deleted, 30 days after it finished, and when they were.
    expires_at: UTCDateTime | None
    sources_deleted_at: UTCDateTime | None = None
    # Its ZIP archive, once one was asked for.
    archive: IngestArchiveOut | None = None


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


class IngestRenderPlanQuoteIn(IngestRequest):
    render_plan: dict[str, Any]


class IngestPlannedJob(BaseModel):
    """One job a render plan makes for each design: its kind, its price and how many files it makes."""

    kind: str
    credits: int
    files: int


class IngestRenderPlanQuote(BaseModel):
    """What a render plan costs each design, priced as a batch with it will be held and charged."""

    render_credits: int
    jobs: list[IngestPlannedJob]


class LookTemplateOut(BaseModel):
    """One of the caller's look templates (features/ingest/templates.py), with what its swatches
    need: each material's name, and the catalogue items and library materials it names."""

    id: int
    name: str
    source_scene_id: int | None
    template: dict[str, Any]
    labels: dict[str, str]
    look: SceneLook
    created_at: UTCDateTime
    updated_at: UTCDateTime


class LookTemplateList(BaseModel):
    items: list[LookTemplateOut]
