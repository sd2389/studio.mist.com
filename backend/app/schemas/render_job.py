from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from app.schemas.scene import SceneLook
from app.schemas.utc import UTCDateTime


class RenderJobCreate(BaseModel):
    """A render job to create. The service checks `kind`, `spec` and `look` (400 naming the field)."""

    model_config = ConfigDict(extra="forbid")

    kind: str = Field(min_length=1, max_length=24)
    scene_id: int
    # The look comes from `look` (the studio's current state), else the saved variant, else the scene.
    variant_id: str | None = Field(default=None, min_length=1, max_length=64)
    look: dict[str, Any] | None = None
    # The outputs' file stem; without it, the scene's SKU or name.
    name: str | None = Field(default=None, max_length=255)
    spec: dict[str, Any]


class RenderJobBulkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    jobs: list[RenderJobCreate] = Field(min_length=1)


class RenderJobOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int = Field(exclude=True)
    kind: str
    label: str | None
    filename: str | None
    content_type: str | None
    bytes: int
    width: int | None
    height: int | None

    @computed_field
    @property
    def download_url(self) -> str:
        return f"/render-jobs/{self.job_id}/outputs/{self.id}/download"


class RenderJobOut(BaseModel):
    """A job, as every user endpoint returns it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    status: str
    scene_id: int | None
    batch_id: int | None
    spec: dict[str, Any]
    # What else the request named. With the spec (less what the API adds: `output_names`, and the
    # `frames` of a still, an angle set or a Campaign Pack; a turntable and a spin ask for their
    # own) they make the same job again: the look is the stored snapshot, a background image kept
    # as {"type": "image", "asset_id"}.
    look: dict[str, Any] | None
    variant_id: str | None
    name: str | None
    watermark: bool
    credits: int
    credit_state: str
    progress: float
    stage: str | None
    attempts: int
    error: str | None
    error_code: str | None
    cancel_requested_at: UTCDateTime | None
    outputs: list[RenderJobOutput] = Field(default_factory=list)
    created_at: UTCDateTime
    started_at: UTCDateTime | None
    finished_at: UTCDateTime | None


class RenderJobBulkOut(BaseModel):
    jobs: list[RenderJobOut]


class RenderJobPage(BaseModel):
    """The caller's jobs, newest first; pass `next_before` as `before` for the next page."""

    items: list[RenderJobOut]
    next_before: int | None


class RenderJobQuote(BaseModel):
    """What a job would cost and make, before anything is spent."""

    credits: int
    # The size of every image or frame (a spin's frames are its size square; a Campaign Pack
    # gives its stills' size), and how many it renders (all of a pack's images and frames).
    width: int
    height: int
    frames: int
    outputs: list[str]  # the file names, as the spec keeps them in output_names
    watermark: bool
    warnings: list[str]


class RenderJobRefusal(BaseModel):
    """Why a job or a request can't be made: the status creating it would answer, and its reason."""

    status: int
    detail: str


class RenderJobBulkQuoteItem(BaseModel):
    """One job of a bulk quote: what it would cost and make, or why it can't be made."""

    quote: RenderJobQuote | None = None
    refused: RenderJobRefusal | None = None


class RenderJobBulkQuote(BaseModel):
    """What a bulk request would cost and make, job by job, before anything is spent."""

    credits: int  # the jobs that can be made, together
    items: list[RenderJobBulkQuoteItem]  # in the request's order
    # Why the plan refuses the request as a whole (Free has no bulk requests); its jobs are still priced.
    refused: RenderJobRefusal | None
    warnings: list[str]


# ---------------------------------------------------------------------------
# The worker protocol (docs/adr/0005-server-exports.md, "Endpoints for workers")
# ---------------------------------------------------------------------------

# Every kind of ADR 0005 and 0006; MAX_RUNTIME_SECONDS in features/render_jobs/worker.py has one
# run time limit for each.
JobKind = Literal["still", "angle_set", "turntable", "spin", "campaign_pack", "convert", "batch_archive"]
# What a worker reports. A failure with one of the first five codes is retried while attempts
# are left; the others end the job. The API records `lease_expired` itself. `encode_failed` is
# ffmpeg failing on a turntable's MP4. A convert job whose stones alone pass the plan's polygon
# cap, or that may not be decimated, is `over_polygon_cap`.
FailureCode = Literal[
    "browser_crashed", "gpu_lost", "upload_failed", "encode_failed", "unknown",
    "invalid_spec", "model_unreadable", "input_missing", "over_limit", "timeout", "canceled",
    "over_polygon_cap",
]
RenderStage = Literal["loading", "rendering", "encoding", "uploading"]
# How a worker names itself; a job keeps the name of the worker that holds it.
WORKER_ID = r"^[A-Za-z0-9._:-]{1,64}$"
# The file names a job's spec gives its outputs (specs.clean_file_stem keeps them to these).
OUTPUT_NAME = r"^[A-Za-z0-9._-]{1,255}$"


class WorkerRequest(BaseModel):
    """A worker's request body: unknown fields, strings where numbers go and non-finite numbers are refused."""

    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class RenderJobClaimRequest(WorkerRequest):
    worker_id: str = Field(pattern=WORKER_ID)
    kinds: list[JobKind] = Field(min_length=1, max_length=7)


class RenderJobClaim(BaseModel):
    job_id: int
    # Sent back in X-Job-Token on every call for this job, and good until the job's lease is lost.
    job_token: str
    kind: str
    lease_seconds: int
    heartbeat_seconds: int


class ModelURL(BaseModel):
    """A signed GET for the job's model, or a convert job's CAD file (cloud storage)."""

    url: str


class ModelPath(BaseModel):
    """The API route that streams the job's model, or a convert job's CAD file (local storage),
    relative to the API's URL."""

    path: str


class PayloadLimits(BaseModel):
    max_edge: int  # the longest side the job renders
    max_runtime_seconds: int  # how long one attempt may run


class PayloadScene(BaseModel):
    id: int
    name: str | None
    sku: str | None


class RenderJobPayload(BaseModel):
    """What the harness renders a job from, exactly as src/features/render/harness/job-payload.ts reads it."""

    kind: str
    spec: dict[str, Any]  # normalised, with its frame count and output names
    # The look frozen at creation. A background image is the URL the worker fetches it from.
    look: dict[str, Any]
    look_items: SceneLook
    model: ModelURL | ModelPath
    # Decided from the owner's plan when the job was created, so the render carries the mark.
    watermark: bool
    limits: PayloadLimits
    scene: PayloadScene


class ConvertJobPayload(BaseModel):
    """What the harness's convert mode converts a design from (docs/adr/0006-bulk-pipeline.md):
    its spec, and where to fetch its source file and each companion, in the spec's order."""

    kind: Literal["convert"]
    spec: dict[str, Any]  # with its output names
    source: ModelURL | ModelPath
    companions: list[ModelURL | ModelPath]
    limits: PayloadLimits  # max_edge is the thumbnail's size


class RenderJobHeartbeat(WorkerRequest):
    progress: float | None = Field(default=None, ge=0, le=1)
    stage: RenderStage | None = None


class RenderJobHeartbeatOut(BaseModel):
    lease_expires_at: UTCDateTime
    # The owner asked to stop, or the attempt ran past its kind's run time: stop and fail the job.
    cancel: bool


class RenderJobUploadFile(WorkerRequest):
    name: str = Field(pattern=OUTPUT_NAME)
    content_type: str = Field(min_length=1, max_length=64)
    bytes: int = Field(ge=1)


class RenderJobUploadsRequest(WorkerRequest):
    files: list[RenderJobUploadFile] = Field(min_length=1, max_length=100)


class RenderJobUpload(BaseModel):
    name: str
    key: str
    # A signed PUT on cloud storage; on local storage the API route that takes the file,
    # relative to the API's URL.
    url: str
    # Send every one of them with the PUT: the signature covers them.
    headers: dict[str, str]


class RenderJobUploads(BaseModel):
    files: list[RenderJobUpload]


class RenderOutputMeta(WorkerRequest):
    sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")


class RenderJobOutputReport(WorkerRequest):
    """One uploaded output, as complete lists it."""

    name: str = Field(pattern=OUTPUT_NAME)
    key: str = Field(min_length=1, max_length=512)
    content_type: str = Field(min_length=1, max_length=64)
    bytes: int = Field(ge=1)
    width: int | None = Field(default=None, ge=1, le=8192)
    height: int | None = Field(default=None, ge=1, le=8192)
    label: str | None = Field(default=None, max_length=128)
    meta: RenderOutputMeta | None = None


class RendererAdapter(WorkerRequest):
    vendor: str = Field(max_length=256)
    architecture: str = Field(max_length=256)
    device: str = Field(max_length=256)
    description: str = Field(max_length=256)


class RendererInfo(WorkerRequest):
    """What drew the job: the browser, three.js's backend and the GPU adapter."""

    browser: str = Field(min_length=1, max_length=512)
    backend: Literal["webgpu", "webgl2"]
    adapter: RendererAdapter | None = None


class RenderJobCompleteRequest(WorkerRequest):
    outputs: list[RenderJobOutputReport] = Field(min_length=1, max_length=100)
    renderer: RendererInfo


class RenderJobFailRequest(WorkerRequest):
    error: str = Field(min_length=1, max_length=1024)
    code: FailureCode
    retryable: bool


class RenderJobStatus(BaseModel):
    """What complete and fail answer with."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    attempts: int
    error: str | None
    error_code: str | None
