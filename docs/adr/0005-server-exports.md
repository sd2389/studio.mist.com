# ADR 0005: Every export renders on the server

## Status

Proposed (2026-10-03). The product owner decided that every export renders on the server; this ADR records the design and the order to build it in. [ADR 0006](0006-bulk-pipeline.md) builds the bulk pipeline on the same jobs.

## Context

### Exports today

Every export renders in the customer's browser, on the customer's GPU, from a clone of the live studio scene.

| Export | UI | Renders with | Plan check |
|---|---|---|---|
| Hi-res still (HD to 8K, PNG or JPEG, cutout) | `HiResExportModal`, `EditorImageTab` "Single" | `exportStill` (`src/features/render/ui/StillExportSettings.tsx`) → `renderAtResolution` (`src/lib/offscreen-render.ts`), 8 jittered samples | `loadExportPlan` + `assertExportSize`, in the browser |
| Batch stills and videos (variants × scenes) | `EditorImageTab`, `EditorVideoTab` "Multiple" | `runBatchExportJobs` (`src/lib/variants/batch-export.ts`) swaps the live store and model for each job | `batch_export_enabled`, read in the browser |
| Turntable, multi-angle video | `Video360Modal`, `EditorVideoTab` | `recordTurntable` / `recordMultiAngle` (`src/lib/video-capture.ts`): WebCodecs H.264 + Mediabunny MP4, PNG ZIP fallback | size cap and watermark inside the offscreen session |
| Campaign Pack | `CampaignPackDialog` (`src/features/render/campaign-pack/`) | `createOffscreenRenderSession` + `createMp4FrameEncoder`; the ZIP is built in memory | `assertCampaignPackAllowed`, in the browser |
| Download PNG | `ExportSharePanel` | `renderAtResolution` at twice the canvas size | browser |
| Capture still, Update thumbnail | `ExportSharePanel`, `EditorSettingsTab` | live canvas data URL → `/api/render/save` → `POST /renders` | the server fits the image to the cap (`fit_to_plan`) |

The plan limits (Free: 4K, tiled "MIST Studio" mark, no Campaign Pack, no batch export; Grow and Studio: 8K, no mark, Campaign Pack) live in `src/features/render/lib/export-plan.ts`, `src/lib/export-limits.ts` and the offscreen session, which stamps `drawExportWatermark` (`src/lib/export-watermark.ts`) on every frame. A modified client skips all of them. None of these exports charges a render credit.

The server has a start, from #23. `render_jobs` (`backend/app/features/render_jobs/`) claims with `SELECT … FOR UPDATE SKIP LOCKED`, leases each claim (`RENDER_JOB_LEASE_SECONDS`, default 600), issues a fresh per-job token on every claim and reads it from `X-Job-Token`, allows 3 attempts, charges 1 render credit on success, puts the owner's Free watermark flag in the payload, and caps a user at 10 active jobs. A Playwright worker (`scripts/render-worker/worker.mjs`) opens `/render-harness?job=<id>`, whose job mode (`src/features/viewer/ui/RenderHarness.tsx`) renders one PNG with `renderAtResolution` and posts it to `complete`. That job knows one material preset and one lighting preset: no saved look, no camera, no video, no list endpoint, no UI, and the browser runs on SwiftShader (`launchDeterministicBrowser` in `scripts/golden/browser.mjs`).

### What we checked

| Question | How | Answer |
|---|---|---|
| Which browser Playwright drives | Playwright release notes, v1.57: "Playwright now runs on Chrome for Testing builds rather than Chromium. Headed mode uses `chrome`; headless mode uses `chrome-headless-shell`", and "On Arm64 Linux, Playwright continues to use Chromium". `node_modules/playwright-core/browsers.json` for 1.61.1: Chrome for Testing 149. | Chrome for Testing on x86-64 Linux and macOS |
| H.264 in that browser | Chromium `build/config/features.gni`: `proprietary_codecs = is_chrome_branded \|\| is_castos \|\| is_cast_android \|\| is_chrome_for_testing_branded`; `media/media_options.gni` turns OpenH264 software encoding off without proprietary codecs; `media/video/openh264_video_encoder.cc` refuses frames over 36,864 macroblocks (about 4096×2304). Probe of `VideoEncoder.isConfigSupported` in Playwright's cached Chrome for Testing 145 (macOS arm64, headless shell and new headless): H.264 High at 1920×1080 and 3840×2160 supported; 7680×4320 refused in every hardware mode. | Up to 4K, never 8K. 8K MP4s fall back to a PNG ZIP today, and a pack's turntables have no fallback |
| WebGPU in headless | Same probe. `chrome-headless-shell` (Playwright's default headless) has `navigator.gpu` but `requestAdapter()` returns null; with `--enable-unsafe-webgpu` it returns a SwiftShader adapter. Chrome for Testing in new headless (`--headless=new`, Playwright `channel: "chromium"`) returns the Metal GPU with no flags. | The worker must run new headless |
| Secure context | Same probe on `http://<LAN address>`: neither `navigator.gpu` nor `VideoEncoder` exists. On `http://127.0.0.1` both do. | The worker serves the harness on loopback |
| What CI goldens cover | Same probe with CI's flags (`--use-angle=swiftshader --disable-gpu`): `requestAdapter()` returns null, so three.js falls back to its WebGL 2 backend. | Goldens test WebGL 2, not the WebGPU path exports will use |
| Linux and NVIDIA | Chrome for Developers, "Supercharge Web AI model testing": `--headless=new --use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface --enable-unsafe-webgpu`. gpuweb "Implementation Status": WebGPU on by default on Linux for Intel Gen12+ (Chrome 144) and NVIDIA driver 535.183.01+ on Wayland (Chrome 147), other setups need `--enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE`. NVIDIA Container Toolkit: `NVIDIA_DRIVER_CAPABILITIES` defaults to `utility,compute`; `graphics` is "required for rendering OpenGL, EGL, and Vulkan applications". | Documented; not run here |
| Server-side H.264 | Local ffmpeg 9.0.2: raw RGBA frames on stdin → libx264 High, yuv420p, BT.709 tags, `moov` ahead of `mdat`, at 1920×1080 and at 7680×4320 (level 6.0). | Works, 8K included |
| Chromium sandbox | Playwright API: `chromiumSandbox` "Enable Chromium sandboxing. Defaults to `false`." | The worker must turn it on |

Assumed, not verified: WebGPU in a container on a Linux NVIDIA host with the flags above (A4 proves it on the chosen host); the full harness on a GPU matches the same harness on SwiftShader WebGPU within golden tolerance (A3); a `page.worker.tsx` route stays out of builds whose `pageExtensions` leave out `worker.tsx` (the Next 16 docs in `node_modules/next/dist/docs` describe `pageExtensions` for the App Router; A3 checks the build output); Playwright 1.61's Chrome for Testing 149 behaves like the cached 145 we probed.

### Things in the code this design works around

- `consume_render_credit` and `consume_model_credit` read the balance, then write it, in Python: two requests at once can both pass. Holds use one atomic `UPDATE`.
- `presign_get` and `presign_put` raise 503 on local storage (`backend/app/core/storage/local.py`), so today's job payload fails for a stored model in local dev. Jobs need an API-streamed fallback there.
- The public scene reads (`/scenes/by-sku/…`, `/scenes/by-model/…`) return the scene's `renders`. Export outputs will be renders, so public reads must stop returning them.
- `renders.bytes` is a 32-bit `Integer`; a pack ZIP can pass 2 GB.
- Deleting a scene deletes rows only: its files stay in storage and `release_storage_bytes` is never called. Saved renders never count toward storage.
- `src/lib/__tests__/export-parity.test.ts` requires `downloadPng` in `ExportSharePanel` to call `renderAtResolution`; Phase C replaces that test.
- The pack's metal re-skin turns the whole piece into one metal (two-tone designs are lost), its auto-framing ignores `InstancedMesh`, and its environment probe waits for the live frame loop (`engine/environment-probe.ts`). The harness must keep frames ticking or re-skinned metals render without reflections.

## Decision

### Shape

```
Studio (browser)                    API (FastAPI)                        Worker host (GPU)
live viewer only                    render_jobs: one Postgres queue      worker.mjs (Node)
 ── POST /render-jobs ───────────▶  validate spec and look               ── claim (X-Worker-Token) ──▶ API
 ◀─ job: status, progress ────────  check plan, price, hold credits      ◀─ payload (X-Job-Token)
 ◀─ 302 to a signed URL ──────────  renders: outputs, per scene          heartbeat · uploads · complete/fail
                                    private storage ◀──── presigned PUT ─ Chrome for Testing, new headless, WebGPU
                                                                           /render-harness?mode=export
                                                                           (worker build, on 127.0.0.1)
                                                                         ffmpeg (MP4) · fflate (ZIP)
```

1. The browser renders no export. It shows the live viewer, sends job requests, shows progress, and downloads finished files.
2. `render_jobs` stays the one queue for every server render, and grows a `kind` and a JSON `spec`. The API validates both, checks the plan, prices the job and holds its credits before the job is queued.
3. A worker host runs Chrome for Testing in new headless mode on a GPU, opens the harness from its own loopback server, and renders with the offscreen pipeline the browser uses today (`createOffscreenRenderSession`). Output matches what customers downloaded before.
4. Outputs are private files under the owner's prefix and rows in `renders`, the scene's renders. Downloads are short-lived signed URLs.
5. The worker page stamps the Free mark on every image and frame when the job says so. The API sets that flag from the owner's plan when it creates the job.

### Job kinds

| Kind | Produces | Notes |
|---|---|---|
| `still` | 1 PNG or JPEG | camera: the live view, a saved pose or a named angle |
| `angle_set` | N PNG or JPEG | one look from several cameras, one page load |
| `turntable` | 1 MP4 (H.264 High, yuv420p, faststart) | an orbit from a view, or a cut through saved poses (today's "Multi-angle") |
| `spin` | 1 ZIP: N frames and `spin.html` | the pack's spin viewer (`domain/spin-viewer.ts`) |
| `campaign_pack` | 1 ZIP | the pack's effective config; Grow and Studio |
| `convert` | a scene (GLB, thumbnail, model config) | [ADR 0006](0006-bulk-pipeline.md) |
| `batch_archive` | ZIP parts | [ADR 0006](0006-bulk-pipeline.md) |

### Creating a job

```http
POST /render-jobs
Idempotency-Key: 6f0d1c1e-3b8f-4a1e-9a55-0f1d2a3b4c5d

{
  "kind": "still",
  "scene_id": 812,
  "variant_id": null,
  "look": { "...": "optional, see below" },
  "name": "solitaire-4K-16x9",
  "spec": {
    "camera": { "view": { "position": [0.62, 0.88, 2.25], "target": [0, 0, 0] } },
    "width": 3840, "height": 2160,
    "format": "png", "jpeg_quality": 0.95, "transparent": false
  }
}
```

- `scene_id` must be the caller's (404 otherwise).
- The look comes from one place, in this order: `look` (the studio's current state, unsaved edits included), else `variant_id` (a saved variant's snapshot, read from `scene.variants`), else the scene's saved look. The API copies it into the job, so a retry renders the same thing even if the scene changes.
- `name` is the file stem (cleaned to `[A-Za-z0-9._-]`, at most 96 characters); without it the API uses the scene's SKU or name.

### The look snapshot

The look is exactly what the studio autosaves (`persistPayload` in `src/features/viewer/ui/useSavedScene.ts`), so the client builds it with the same function:

```json
{
  "material": "gold-18k-yellow",
  "lighting": "studio",
  "slot_selections": { "Metal 1": "catalog:gold-18k-rose-satin", "Gem 1": "diamond", "Accent 1": "custom:41" },
  "scene_settings": {
    "ENVIRONMENT-METAL": "studio-softbox", "ENVIRONMENT-GEM": null, "BACKGROUND": "paper-warm", "GROUND": "shadow-soft",
    "quality_mode": "photometric", "sceneSetup": null, "finish": "polished", "customBackground": null,
    "advanced": { "exposure": 1.1, "bloom": 0.2, "ao": true, "metalEnvRotation": 30 },
    "modelTransform": { "position": { "x": 0, "y": 0, "z": 0 }, "rotation": { "x": 0, "y": 0.4, "z": 0 } },
    "poses": [{ "id": "pose-hero", "name": "Hero", "cameraPosition": [1.2, 0.6, 1.8], "target": [0, 0, 0] }]
  },
  "model_config": { "...": "the scene's model config, materialProps (layer visibility) included" }
}
```

The API validates it with one function, `validate_look` in `backend/app/features/scene/look.py`, next to `scene_look`, and rejects the job with 400 and the offending field when:

- `lighting` is not one of `studio`, `soft`, `dark`, `catalog`, `dramatic`; `finish` is not a known finish; `quality_mode` is not `standard` or `photometric`.
- a `slot_selections` value is not a preset id (`^[a-z0-9-]{1,64}$`), an active catalogue metal or gem (`catalog:<slug>`), or the caller's own library material (`custom:<id>`); or a key names no slot of the model config.
- an environment, background or ground slug is not active in the catalogue. Unknown legacy ids pass through, as the embed treats them.
- `customBackground` is anything but a colour or a gradient of colours. `url(` is refused, so a look can't make the worker fetch an address.
- a number is not finite or is out of range (exposure 0.1 to 4, rotations within ±360°, positions within ±10, at most 32 poses).
- the look is over 64 KB as JSON.

`scene_look` is refactored to resolve a look rather than a `Scene`, so the payload carries the catalogue items and library materials the look names (`SceneLook`), as ADR 0004 does for the embed. Saved looks go through `validate_look` too when a job copies them; the scene PATCH still stores `scene_settings` unchecked and adopts the same check in a follow-up.

### Cameras

A camera is one of three shapes:

```json
{ "view":  { "position": [0.62, 0.88, 2.25], "target": [0, 0, 0] } }
{ "pose":  "pose-hero" }
{ "angle": "three-quarter", "margin_pct": 8 }
```

- `view` is the live camera (`captureCurrentCameraPose`), drawn with the viewer's 42° field of view.
- `pose` names a saved pose in the look's `scene_settings.poses` or one of `DEFAULT_POSES` (`src/lib/viewer-scene.ts`).
- `angle` is one of the pack's built-in angles (`front`, `three-quarter`, `top`, `side`; `domain/defaults.ts`), framed on the model's bounds by the pack's `framing.ts` and `pack-camera.ts` (30° field of view, margin 0 to 20%).

### Specs by kind

`still`: `camera`; `width` and `height` (64 to 8192, within the plan's cap); `format` `png` or `jpeg`; `jpeg_quality` 0.8 to 1; `transparent` (PNG cutout without the set and shadow, as `prepareCutoutScene` does today; a transparent JPEG becomes white, as today). The client keeps computing sizes from `IMAGE_RESOLUTIONS` and `ASPECT_RATIO` (`src/lib/export-presets.ts`); the API prices by the pixels it is sent.

`angle_set`: the still fields, with `cameras` (1 to 12) in place of `camera`.

`turntable`:

```json
{
  "width": 1920, "height": 1080, "fps": 30, "frames": 120, "quality": "high",
  "path": { "orbit": { "start": { "view": { "position": [0.62, 0.88, 2.25], "target": [0, 0, 0] } } } }
}
```

`path` is either an orbit from a start camera (frame 0 matches the start view, as `recordTurntable` does) or `{ "poses": ["pose-top", "pose-right"] }`, which holds each pose for an equal share of the frames, as `recordMultiAngle` does. Width and height must be even. `quality` maps to an x264 CRF: `standard` 23, `high` 20, `max` 17.

`spin`: `{ "frames": 72, "size": 1080, "format": "jpeg", "jpeg_quality": 0.9, "transparent": false }`. The orbit is the pack's: elevation 20°, start azimuth 35°, distance fitted at 48 azimuths. The ZIP holds the frames and `spin.html`.

`campaign_pack`: the pack's `CampaignPackConfig` (`domain/types.ts`), as the dialog resolves it (embed off without a SKU; background `scene` when the studio has a set and the user didn't choose one):

```json
{
  "metals": ["gold-18k-yellow", "gold-18k-white", "gold-18k-rose"],
  "angleIds": ["front", "three-quarter", "top", "side"],
  "stillSize": 2000, "formats": { "jpg": true, "png": true },
  "background": { "kind": "white" }, "jpegQuality": 0.95,
  "autoFrame": true, "marginPct": 8, "contactShadow": true,
  "turntable": { "enabled": true, "formats": ["landscape", "square"], "durationSec": 10, "fps": 30 },
  "spin": { "enabled": true, "frames": 72, "size": 1080 },
  "embed": true, "cutScope": true
}
```

The API checks metals against the preset list (plus `current`), angles against the built-ins and `pose:<id>` of the look, `stillSize` against `PACK_STILL_SIZES`, and the totals against the caps below.

Specs are Pydantic models in `backend/app/features/render_jobs/specs.py`, one per kind, behind a union on `kind`. Unknown fields are refused. The API stores the normalised spec, with the computed frame count and output names, and returns it on the job.

### Tables

`render_jobs` keeps its name, its claim and lease code, and its tests; it gains columns. Existing rows come from smoke tests only (nothing in the UI creates jobs): the migration gives them `kind = 'still'` and moves `width`, `height`, `preset` and `lighting` into `spec`. A2 drops `model_ref`, `lighting`, `preset`, `width`, `height` and `result_key` once the worker reads the new payload.

| Column | Type | Notes |
|---|---|---|
| `id`, `user_id`, `scene_id` | existing | `scene_id` is required for every kind but `convert` and `batch_archive` |
| `batch_id` | int, FK `ingest_batches`, SET NULL, nullable | ADR 0006 |
| `kind` | varchar(24), not null | the kinds above |
| `spec` | JSON, not null | normalised spec |
| `look` | JSON, nullable | the validated look, frozen at creation |
| `watermark` | bool, not null | from the owner's plan at creation |
| `priority` | smallint, default 0 | 100 from the studio, 10 for batches |
| `max_running` | smallint | the owner's running cap at creation, for fair claims |
| `status`, `attempts`, `worker_token`, `lease_expires_at`, `error` | existing | |
| `max_attempts` | smallint, default 3 | |
| `run_after` | timestamp, nullable | retry backoff |
| `worker_id` | varchar(64), nullable | which worker holds it |
| `heartbeat_at` | timestamp, nullable | |
| `progress` | real, default 0 | 0 to 1 |
| `stage` | varchar(16), nullable | `loading`, `rendering`, `encoding`, `uploading` |
| `cancel_requested_at` | timestamp, nullable | |
| `credits` | int, default 0 | credits held, then charged |
| `credit_state` | varchar(12) | `held`, `charged`, `refunded`, `none` |
| `billing_period_start` | timestamp, nullable | the period the hold was taken in |
| `idempotency_key` | varchar(128), nullable | |
| `request_hash` | char(64), nullable | SHA-256 of the canonical request |
| `error_code` | varchar(32), nullable | |
| `renderer` | JSON, nullable | browser version, `webgpu` or `webgl2`, adapter, as the worker reports them |
| `started_at`, `finished_at` | timestamp, nullable | |

Indexes: `(status, priority, created_at)` for claims (partial on `status = 'queued'` in Postgres); `(status, lease_expires_at)` partial on `running`; `(user_id, status)` for caps; `(user_id, created_at, id)` for lists; `(scene_id, created_at)`; `(batch_id, status)`; unique `(user_id, idempotency_key)`.

Outputs are rows in `renders`, the table the scene's renders already live in:

| Column | Change |
|---|---|
| `job_id` | new: int, FK `render_jobs`, SET NULL, indexed |
| `content_type` | new: varchar(64) |
| `filename` | new: varchar(255), the download name |
| `label` | new: varchar(128), e.g. `front` or `18k-yellow-gold` |
| `meta` | new: JSON (frames, fps, duration, metal, angle, SHA-256) |
| `expires_at` | new: timestamp, nullable (pack ZIPs and archives) |
| `bytes` | `Integer` → `BigInteger` |
| `kind` | new values: `turntable`, `spin`, `campaign_pack` |

Output files live at `customers/<user>/renders/<job>/<filename>` (a new `render_job_output_key` in `backend/app/core/storage_keys.py`), so a worker can only write under its own job's prefix. Outputs count toward the owner's storage when the job completes; deleting a render or its scene deletes the file and releases the bytes.

### Statuses, leases and retries

```
queued ──claim──▶ running ──complete──▶ completed
  │                 │──fail (retryable, attempts left)──▶ queued (run_after = backoff)
  │                 │──fail (final), lease lapsed at the last attempt──▶ failed
  │                 └──cancel requested, worker stops──▶ canceled
  └──cancel──▶ canceled
```

- **Claim** (`claim_job`, kept): the oldest job of the highest priority whose `run_after` has passed and whose owner runs fewer than `max_running` jobs, with `FOR UPDATE SKIP LOCKED`, limited to the kinds the worker asks for. A running job whose lease ran out is taken back as a failed attempt, as today. The claim issues a new per-job token and sets the lease to `RENDER_JOB_LEASE_SECONDS`, whose default drops from 600 to 120.
- **Heartbeat** every 20 s extends the lease by another 120 s and reports progress and stage. Its answer carries `cancel: true` when the user cancelled or the job passed its kind's run time limit; the worker then stops and reports it. Run time limits: still 5 min, angle set 10, turntable 30, spin 15, Campaign Pack 60, convert 10, batch archive 30.
- **Fail** carries `{error, code, retryable}`. A retryable failure (`lease_expired`, `browser_crashed`, `gpu_lost`, `upload_failed`, unknown) requeues with `run_after = now + 30 s × 2^(attempts − 1)` until `max_attempts`; anything else is final (`invalid_spec`, `model_unreadable`, `over_limit`, `timeout`, `canceled`).
- **Complete** is accepted once (a second call is 409, as today).
- **Idempotency**: `Idempotency-Key` (1 to 128 characters) is optional for the studio and required on `/v1` (ADR 0006). The same key with the same request returns the existing job with 200; with a different request, 409. The key is unique per user, held on the job.

### Endpoints for users

All take the session bearer, through the Next proxies under `src/app/api/render-jobs/`.

| Method and path | Does |
|---|---|
| `POST /render-jobs` | Creates a job. 201, or 200 for a repeated idempotency key. 400 bad spec or look, 402 plan or credits, 404 scene, 409 key reused, 429 queue full |
| `POST /render-jobs/bulk` | `{ "jobs": [ …up to 100 create bodies… ] }`: validates all, holds all their credits in one transaction, creates all or none. The "Multiple" modes use it |
| `POST /render-jobs/quote` | A create body, without creating: `{ "credits", "width", "height", "frames", "outputs": [names], "watermark", "warnings" }`. The UIs show this price |
| `GET /render-jobs?scene_id=&batch_id=&kind=&status=&before=&limit=` | The caller's jobs, newest first, cursor on `id`, `limit` ≤ 100 |
| `GET /render-jobs/{id}` | One job, for polling |
| `POST /render-jobs/{id}/cancel` | Queued: canceled and refunded at once. Running: `cancel_requested_at` set, canceled when the worker stops. Finished: 409 |
| `GET /render-jobs/{id}/outputs/{render_id}/download` | 302 to a signed GET valid for 300 s; on local storage the API streams the file |
| `GET /renders?scene_id=` | Exists; lists the scene's renders, outputs included |
| `PUT /scenes/{id}/thumbnail` | Sets the thumbnail from a capture of the live view (see Download PNG and Capture still) |

A job, as every endpoint returns it:

```json
{
  "id": 4812, "kind": "still", "status": "completed", "scene_id": 812, "batch_id": null,
  "spec": { "camera": { "view": { "position": [0.62, 0.88, 2.25], "target": [0, 0, 0] } }, "width": 3840, "height": 2160, "format": "png", "jpeg_quality": 0.95, "transparent": false },
  "watermark": true, "credits": 2, "credit_state": "charged",
  "progress": 1, "stage": null, "attempts": 1, "error": null, "error_code": null,
  "outputs": [{
    "id": 991, "kind": "still", "label": null, "filename": "solitaire-4K-16x9.png", "content_type": "image/png",
    "bytes": 18734211, "width": 3840, "height": 2160,
    "download_url": "/render-jobs/4812/outputs/991/download"
  }],
  "created_at": "2026-10-03T14:02:11Z", "started_at": "2026-10-03T14:02:14Z", "finished_at": "2026-10-03T14:02:41Z"
}
```

### Endpoints for workers

`claim` takes `X-Worker-Token`; everything else takes only the job's own token in `X-Job-Token`, never in a URL.

| Method and path | Body → answer |
|---|---|
| `POST /render-jobs/claim` | `{ "worker_id": "gpu-a-1", "kinds": ["still", "angle_set", "turntable", "spin", "campaign_pack"] }` → `{ "job_id", "job_token", "kind", "lease_seconds": 120, "heartbeat_seconds": 20 }`, or 204 |
| `GET /render-jobs/{id}/payload` | → `{ "kind", "spec", "look", "look_items": SceneLook, "model": { "url" \| "path" }, "watermark", "limits": { "max_edge", "max_runtime_seconds" }, "scene": { "id", "name", "sku" } }`. `model.url` is a signed GET (15 min); on local storage `model.path` points at the next route |
| `GET /render-jobs/{id}/inputs/model` | Streams the model (local storage only) |
| `POST /render-jobs/{id}/heartbeat` | `{ "progress": 0.42, "stage": "rendering" }` → `{ "lease_expires_at", "cancel": false }` |
| `POST /render-jobs/{id}/uploads` | `{ "files": [{ "name": "front.jpg", "content_type": "image/jpeg", "bytes": 1834212 }] }` → `{ "files": [{ "name", "key", "url", "headers" }] }`: signed PUTs (15 min) with `Content-Type`, `Content-Length` and `Content-Disposition` signed in, so a plain signed GET later downloads under the right name. On local storage `url` is the next route |
| `PUT /render-jobs/{id}/uploads/{name}` | The file body (local storage only) |
| `POST /render-jobs/{id}/complete` | `{ "outputs": [{ "name", "key", "content_type", "bytes", "width", "height", "label", "meta" }], "renderer": { "browser", "backend", "adapter" } }`. The API checks each key is under the job's prefix and that the stored size matches, then creates the `renders` rows, charges the credits, adds the bytes to the owner's storage, and marks the job completed |
| `POST /render-jobs/{id}/fail` | `{ "error", "code", "retryable" }` |

Tokens are compared with `hmac.compare_digest` (today's `!=` leaks timing). `RENDER_WORKER_TOKEN` accepts a comma-separated list, so a token can be rotated without stopping workers.

### Plans

The API checks all of this when it creates a job, from `backend/app/features/billing/plans.py`. `PlanQuotas` gains the flags that are derived elsewhere today (`batch_export` in `_features_for_tier`, `campaign_pack` from `CAMPAIGN_PACK_TIERS` in the browser), so plans have one source. Values marked *new* are proposals (see Open questions).

| | Free | Grow | Studio |
|---|---|---|---|
| Longest side of a still or video frame | 4096 | 8192 | 8192 |
| Watermark | tiled mark on every image and frame, cutouts included | none | none |
| Kinds | still, angle set, turntable, spin | all | all |
| Campaign Pack | no | yes | yes |
| Several scenes or variants in one request (`/render-jobs/bulk`) | no | yes | yes |
| Video | ≤ 4K, ≤ 30 fps, ≤ 20 s *new* | ≤ 60 fps, ≤ 60 s; 8K ≤ 20 s *new* | same as Grow |
| Spin | ≤ 72 frames, ≤ 1080 px | ≤ 144 frames, ≤ 2048 px | same |
| Jobs running at once / queued from the studio *new* | 1 / 5 | 2 / 20 | 4 / 50 |
| Render credits a month (today) | 25 | 300 | 1500 |

Frame rates above 60 (the Videos tab offers 90 and 120) are dropped.

### Credits

One table in `plans.py`; `render_job_cost(kind, spec)` in `backend/app/features/render_jobs/pricing.py` applies it, and `POST /render-jobs/quote` shows the result before anything is spent.

```python
# Render credits. One credit is about one 2K still.
# Each tier is (up to this many megapixels, credits).
RENDER_CREDIT_COSTS = {
    # A still, per image: 2K 16:9 and 2000² → 1; 4K 16:9, 3000² → 2; 4000² → 3; 8K → 4.
    "still_image": ((4.2, 1), (9.0, 2), (17.0, 3), (36.0, 4)),
    # A turntable, per started 10 seconds, by frame size: 720p → 2; 1080p and 1080² → 3;
    # 4K → 8; 8K → 20. Above 30 fps it counts double.
    "video_10s": ((1.0, 2), (2.1, 3), (8.3, 8), (36.0, 20)),
    # A spin of up to 72 frames: 1080² → 2; 2048² → 4. Up to 144 frames counts double.
    "spin": ((1.2, 2), (4.2, 4)),
    # A Campaign Pack is the sum of its images, turntables and spins, plus 1 for the ASET image.
    # A conversion costs no render credit: a design costs 1 model credit, as an upload does.
}
```

What that makes of today's defaults: a 4K PNG, 2; a Quick still (below), 1; the 360° dialog's 1080p, 120 frames at 30 fps, 3; the default Campaign Pack (24 images at 2000², six 10 s turntables at 1080p, three 72-frame spins, the ASET image), 24 + 18 + 6 + 1 = 49.

Credits move in three steps, in `backend/app/features/billing/quota_service.py`:

1. **Hold** at creation: `UPDATE user_billing SET render_credits_balance = render_credits_balance - :cost WHERE user_id = :user AND render_credits_balance >= :cost`. No row updated means 402. The job keeps `credits`, `credit_state = 'held'` and the billing period it was held in. A bulk request holds the sum in one statement.
2. **Charge** on `complete`: `credit_state = 'charged'`; the balance doesn't move again.
3. **Refund** when the job ends failed or canceled: the held credits go back, unless the billing period has rolled over since the hold (`_apply_allotment` has already reset the balance; adding them back would give a new period extra credits).

A job is all or nothing: an angle set with one failed angle retries the whole set, and a final failure refunds it all. The browser no longer reads the plan to enforce anything; `useExportPlan` stays only to lock pickers and show `ExportPlanNote`.

### The watermark

- The API decides it when it creates a job (`watermark_exports` of the owner's plan) and keeps it on the job, which was quoted that way; a plan change later doesn't change a queued job.
- The worker page passes `limits: { maxEdge, watermark }` to `createOffscreenRenderSession`, which already stamps `drawExportWatermark` on every frame it hands out, cutouts included. Stills, angle sets, video frames, spin frames and pack images are marked before they are encoded; ffmpeg overlays nothing.
- The mark is today's: the same text, angle, tiling and opacity as `src/lib/export-watermark.ts`, which `backend/app/services/export_watermark.py` mirrors for AI images. The worker image installs the fonts the mark asks for (`"Helvetica Neue", Helvetica, Arial`; `fonts-liberation` provides an Arial match on Debian) so it looks like the browser's; A4 compares it with a browser-stamped reference.
- After Phase C the public build no longer imports `export-watermark.ts` or `export-compositing.ts`; only the worker's harness does.

### Download PNG and Capture still

A screenshot of the live viewer can't be prevented, and the live viewer stays unmarked (the studio and the embed need it clean). So the browser keeps one capture that is no more than a screenshot, and every rendered file comes from the server.

- **Download PNG** becomes **Quick still**: a `still` job of the current view (`camera.view`), at the viewport's aspect ratio and 2048 px on the long side, PNG, priority 100, 1 credit, the mark on Free. The button shows progress and downloads the file when it is ready; it also lands in Exports. "Hi-res PNG" opens the still dialog with the same camera.
- **Capture still** becomes **Set as thumbnail**, and the Settings tab's "Update thumbnail" uses the same call. The browser reads the live canvas at no more than 1024 px on the long side and sends it to `PUT /scenes/{id}/thumbnail`. The API, for the owner's scene only, checks by its bytes that it is a PNG, JPEG or WebP under 2 MB and at most 1024 px a side (the studio never sends more), re-encodes it as WebP under the owner's thumbnails, sets `thumbnail_key` and republishes. It is not a render, costs nothing, and carries no mark: it is the piece's public product thumbnail, and no bigger than a screenshot. Like an upload's thumbnail it counts toward storage, and the uploaded thumbnail it replaces is freed, as a still replacing it would free it; a render it replaces stays a render.
- `POST /renders` (a data URL saved as a render) and `/api/render/save` are removed in C4. Renders come only from jobs.

### The worker

**Process.** `scripts/render-worker/worker.mjs` stays the entry point and splits by job into `api.mjs` (claim, payload, heartbeat, uploads, complete, fail), `browser.mjs` (launch profiles and the GPU self-check), `sink.mjs` (the loopback server the page writes to), `encode.mjs` (ffmpeg), `zip.mjs` (fflate's streaming `Zip`) and `assets.mjs` (a disk cache for catalogue and WASM files). The Node process makes every API call; the page never sees a token. Each slot runs one job at a time: claim → payload → download the model into the job's temp folder → start a sink with a random token → open the page → heartbeat every 20 s → upload outputs → complete; on any error, fail with a code.

**Browser.** Playwright `chromium.launch({ channel: "chromium", chromiumSandbox: true, args })`: Chrome for Testing in new headless mode, the only headless mode that got a GPU adapter in our probe.

| Profile | Where | Flags |
|---|---|---|
| `nvidia` | Linux GPU hosts | `--enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE --disable-vulkan-surface --ignore-gpu-blocklist --force-color-profile=srgb --hide-scrollbars`; container `NVIDIA_DRIVER_CAPABILITIES=graphics,utility,compute` |
| `metal` | a Mac, local development | `--force-color-profile=srgb --hide-scrollbars` (Metal needs no flags) |
| `swiftshader` | CI and CPU-only hosts | new headless with `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --use-angle=swiftshader --enable-features=Vulkan --use-vulkan=swiftshader`: WebGPU on SwiftShader, slow but the same backend as production. (As built in A4: on Linux, `chrome-headless-shell`'s SwiftShader WebGPU lost its device.) |

At start the worker opens `/render-harness?mode=probe`, which reports `navigator.gpu.requestAdapter()` and whether three.js picked the WebGPU backend. With `WORKER_REQUIRE_GPU=1` (production) it refuses to claim on SwiftShader or WebGL 2, so a host with broken drivers stays idle rather than producing slow, different output. Every job's `renderer` field records what drew it.

**Secure context.** WebGPU and WebCodecs exist only in a secure context, so the harness is served by a Next server inside the worker container on `http://127.0.0.1:3000`, never from another host over plain HTTP.

**Isolation.** One browser per slot, a fresh context per job (no cookies, storage or cache shared between customers), the browser recycled every 50 jobs and after any crash. The context aborts every request except to the harness origin, the sink, and the catalogue asset origins; catalogue files and the WASM the converters load from jsDelivr and gstatic are served from the worker's disk cache through `context.route`. The container runs as a non-root user with a read-only root file system, a per-job `tmpfs`, and no route to the cloud metadata address.

**Sink.** The page writes to `http://127.0.0.1:<port>`, with the sink token in a header: `POST /files/<name>` for an encoded image or document, `POST /frames/<n>` for a raw RGBA frame, `POST /progress` for `{progress, stage}`, `GET /inputs/model.glb` for the model. The page waits for each response before drawing the next frame, which is the backpressure. Files go to the job's temp folder; frames go straight into ffmpeg.

**Video.** One ffmpeg per turntable, frames on stdin:

```
ffmpeg -f rawvideo -pix_fmt rgba -s <w>x<h> -r <fps> -i pipe:0
  -vf scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv
  -c:v libx264 -preset medium -crf <23|20|17> -profile:v high -movflags +faststart -an out.mp4
```

The `scale` and `setparams` filters matter: without them ffmpeg converts RGB with BT.601 and leaves the colour tags empty, and metals shift colour. B3's test decodes frame 0 and compares it with a still of the same camera. ffmpeg runs as its own binary in an image we don't distribute.

**ZIP.** Spins, packs and archives stream into fflate's `Zip` on disk: media stored, text deflated, the pack's layout and names (`domain/naming.ts`, `domain/documents.ts`). No ZIP64, so a file stays under 4 GB and 65,535 entries; the pack planner already refuses more.

**Uploads.** The worker asks `POST /render-jobs/{id}/uploads` for signed PUTs and streams each file from disk, retrying a failed PUT three times, then calls `complete`.

**Concurrency and scaling.** One slot per GPU by default (`WORKER_SLOTS`), two on 24 GB cards; an 8K still holds about 1 GB of GPU memory and, at 4000², the sample averager alone allocates 256 MB of CPU memory, so give each slot 8 GB of RAM and `shm_size: 2gb`. Studio jobs (priority 100) go before batch jobs (10), and the per-user running cap keeps one customer's 500-design batch from starving everyone else. An admin endpoint, `GET /render-jobs/stats` (queued by kind and priority, oldest wait, running per worker), feeds autoscaling: start a host when the oldest studio job has waited 30 s or the batch backlog exceeds an hour of work, stop it after 15 idle minutes, never above `WORKER_MAX_HOSTS`.

**Image and compose.** `Dockerfile.worker` at the repo root (as built in A4: a build stage makes the worker build's standalone server, which the worker starts on 127.0.0.1, and the image keeps Playwright alone of the dev dependencies), on `node:22-bookworm-slim` (Playwright doesn't support Alpine, which the web image uses). The sketch:

```dockerfile
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg fonts-liberation libvulkan1 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund && npx playwright install --with-deps chromium   # Chrome for Testing and the headless shell
COPY . .
RUN BUILD_TARGET=worker NEXT_PUBLIC_ENABLE_RENDER_HARNESS=1 npm run build
USER node
CMD ["node", "scripts/render-worker/worker.mjs"]
```

`docker-compose.yml` gains two services that plain `docker compose up` leaves off: `worker-gpu` (profile `worker-gpu`, `nvidia` profile, one GPU reserved through `deploy.resources.reservations.devices`) and `worker-cpu` (profile `worker-cpu`, `swiftshader`, for local smoke tests with `STORAGE_BACKEND=local`). Both get `RENDER_API_URL`, `RENDER_WORKER_TOKEN` and `shm_size`. On a Mac, `WORKER_GPU=metal npm run worker:render` runs the worker against a local stack. Chrome for Testing is x86-64 on Linux; arm64 Linux hosts would get Playwright's Chromium and are out of scope.

### The harness export mode

- **Route.** `src/app/render-harness/page.tsx` becomes `page.worker.tsx`, and `next.config.ts` adds `worker.tsx` to `pageExtensions` only when `BUILD_TARGET=worker`. The public build has no harness route at all, rather than a route that 404s. CI checks the public build has no `render-harness` entry and that no public chunk contains the export mode.
- **Modes.** `?mode=probe`, `?mode=export`, `?mode=convert` (ADR 0006); no mode is today's golden capture. The job arrives in `window.__RENDER_JOB__` (`{payload, sink}`), set by the worker with `addInitScript`, never in the URL. Export code lives in `src/features/render/harness/`, which `scripts/check-feature-imports.mjs` lets only the worker route import.
- **Stage.** The page builds the stage the way the embed does: `registerLookMaterials(look_items)`, the look into the studio store, `buildLookCatalogIndex(null, look_items)` and the lookups, inside `ViewerStage`, so CSS backdrops are on the page and `readViewportBackdrop` reads them as it does in the studio. The part of `ViewerShell` that turns a look into stage props moves into one shared hook, `useLookStage`, used by the studio, the embed and the harness.
- **Clock.** `frameloop="never"`, and the page ticks `advance()` on a fixed clock (frame N at N/60 s) for 60 warm-up frames, as goldens do. Ticking keeps the environment bridges running, which the pack's environment probe needs.
- **Rendering.** The camera comes from the spec. Stills use the session's `capture()` with `STILL_EXPORT_SAMPLES` (8), as `renderAtResolution` does; turntable frames are one sample at time i/fps and spin frames one sample at time 0, as `recordTurntable` and the pack do. The session gets `limits` from the payload. Each image goes to the sink as it is encoded; video frames go as raw RGBA.

### Client changes

Every export UI becomes "create a job → show progress → download".

| UI | Becomes |
|---|---|
| `HiResExportModal`, `EditorImageTab` "Single" | one `still` (camera: the live view) |
| `EditorImageTab` "Multiple" | `POST /render-jobs/bulk`: one `still` per scene and variant picked (`scene_id` + `variant_id`; the current scene sends its live look) |
| `Video360Modal`, `EditorVideoTab` "Simple" | one `turntable` with an orbit from the live view |
| `EditorVideoTab` "Multi-angle" | one `turntable` through the saved poses |
| `EditorVideoTab` "Multiple" | `POST /render-jobs/bulk` of turntables |
| `CampaignPackDialog` | one `campaign_pack` with the effective config |
| `ExportSharePanel` | Hi-res → still dialog; Download PNG → Quick still; Capture still → Set as thumbnail |
| `EditorSettingsTab` "Update thumbnail" | `PUT /scenes/{id}/thumbnail` |

New, in `src/features/render` (exported from its barrel):

- `lib/render-jobs-api.ts`: `createRenderJob`, `createRenderJobs`, `quoteRenderJob`, `getRenderJob`, `listRenderJobs`, `cancelRenderJob`, `outputDownloadUrl`, through new Next routes in `src/app/api/render-jobs/`.
- `ui/useRenderJob.ts`: polls one job (every second, slowing to every 5 s, stopping at a final status).
- `ui/ExportJobsPanel.tsx`: the downloads and results panel. It lists the scene's recent jobs (status, progress bar, credits, Cancel, Download for each output, Retry for a failed one) in "Export & share", under the Quick still that starts one, and the same component with no scene filter is an "Exports" page linked from the dashboard. A finished job raises a toast through the viewer toast store; the dialog that started a job downloads its file when it finishes, if the dialog is still open.
- `src/features/viewer/domain/look-snapshot.ts`: `lookSnapshot(store, modelConfig)`, used by the autosave in `useSavedScene` and by every export, so a job renders exactly what the studio would save.

Reused:

| Component | Use |
|---|---|
| `StillExportSettings` | the resolution, aspect, format, quality and cutout pickers, without `exportStill` |
| `VideoResolutionField`, `ChipField` | video size, frames, fps and quality pickers, unchanged |
| `UpgradePrompt`, `ExportPlanNote`, `useExportPlan` | locks and upgrade prompts, unchanged; plus the quoted credits next to each Render button |
| `useCaptureRun` | becomes the job runner: same `busy`, `progress`, `etaLabel`, `error`, `status`, `notice`, `cancel`, fed by the job instead of a local loop |
| `useBatchExport`, `BatchJobEstimate` | the variant and scene picks; `buildJobs` now produces bulk targets, and the estimate shows credits |

Removed (C4, D2): `exportStill`; `turntableCaptureOptions`; `runBatchExportJobs` and its live store swapping; `createMp4FrameEncoder`, `src/lib/video-codec.ts` and the `mediabunny` dependency; the WebCodecs warnings in the video UIs; `engine/start-pack.ts` and the pack's in-browser download; `captureFrameToDataUrl`'s limits; `POST /renders` and `/api/render/save`. `offscreen-render.ts`, `video-capture.ts`'s camera paths, `export-compositing.ts`, `export-watermark.ts` and the pack engine stay, imported only by the worker's harness. `export-parity.test.ts` becomes a boundary rule: nothing a public route imports may reach them.

### Security and limits

- **Worker auth.** `X-Worker-Token` (a list, for rotation) only claims. Each claim issues a new job token, sent only in `X-Job-Token`, good for that one job until its lease is lost; a worker that lost its lease is refused (as today).
- **The page holds no secret.** The Node process makes every API call and serves inputs through the sink; the page gets the payload and a sink token.
- **Private outputs.** Files under the owner's prefix; downloads through signed GETs that live 300 s; the public scene reads stop returning `renders`.
- **Input validation.** Specs are strict Pydantic models; looks go through `validate_look`; the scene, variant and library materials must be the caller's. Models pass the strict GLB checks being added on `fix/strict-model-uploads` (its first commit makes `get_bytes` refuse an object over a size cap). `complete` accepts only keys under the job's prefix with the size it was told.
- **Resource limits.** At most 8192 px on a side and 36 MP a frame; at most 3,600 video frames, 144 spin frames and 12 angles a job; a pack of at most 8 metals and 8 angles, its ZIP under 4 GB; run time per kind as above; 100 jobs per bulk request; a 64 KB look.
- **Isolation.** Chromium's sandbox on (Playwright turns it off by default), a fresh browser context per job, a network allowlist, non-root, read-only root, no cloud metadata route.
- **Abuse.** Credits are held before work starts, so spend is bounded; per-plan running and queued caps; job creation goes through the rate limiter (shared across processes in ADR 0006); a feature flag, `server_exports`, in the admin console's flags turns the whole path off.
- **What it can't stop.** A screenshot or a canvas readback of the live viewer; and "Download source model" hands the owner their own GLB. Strict exports make our export features enforced and metered; they don't stop anyone rendering their own model elsewhere.

## Consequences

- The server enforces every plan limit and the watermark, and charges credits for every export, which browser exports never did. That is a visible pricing change for customers.
- Exports no longer depend on the customer's GPU: 8K stills on any laptop, 8K MP4s (Chrome's H.264 encoders stop near 4K), packs without the browser's memory limit, and a tab that isn't frozen while it renders.
- Results take seconds to minutes in a queue instead of rendering on the spot.
- We run GPU hosts: a Docker image with Chrome, drivers and ffmpeg, autoscaling, monitoring, and a GPU bill.
- Server renders can differ slightly from the customer's live view (different GPU, WebGPU on Vulkan rather than Metal or D3D); goldens on SwiftShader WebGPU and a GPU smoke test bound it.
- The bulk pipeline (ADR 0006) and a customer API become possible on the same jobs.
- The public bundle loses the export pipeline, the pack engine and Mediabunny.

## Rollback

- Phases A and B add tables, columns, endpoints and a worker; nothing in the UI uses them until C, so they can ship and sit unused.
- Through Phase C, the `server_exports` flag picks server jobs or the browser path per environment. Turning it off restores browser exports.
- After C4 and D2 delete the browser paths, rollback is reverting those PRs and turning the flag off.
- Migrations are additive until A2 drops the old `render_jobs` columns; downgrades drop the new columns. Workers can be scaled to zero at any time; queued jobs wait, and cancelling them refunds their credits.

## Plan

Small PRs, each mergeable on its own. "After" is a hard dependency; PRs with no dependency between them can run in parallel. ADR 0006's Phase E0 (scale fixes) can run alongside all of this.

The code suggests one change to the A→D order: stills don't need Phase B, so C1 and C2 start as soon as Phase A lands, and customers get server stills while video is still being built.

### Phase A: jobs, worker and harness for stills and angle sets

**A1. Render jobs: kinds, specs, looks and credit holds** (backend)
- Scope: the `render_jobs` and `renders` migration; `specs.py` for `still` and `angle_set` (other kinds answer 400 until their phase); `validate_look`, and `scene_look` taking a look; `PlanQuotas` fields and `RENDER_CREDIT_COSTS`; `pricing.py`; atomic hold, charge and refund; create with idempotency, bulk, quote, list, get, cancel, download; public scene reads without renders. The old worker routes keep working for `kind = 'still'`.
- Files: `backend/alembic/versions/<rev>_render_job_kinds.py`, `backend/app/models/{render_job,render}.py`, `backend/app/schemas/render_job.py`, `backend/app/features/render_jobs/{service,specs,pricing}.py`, `backend/app/features/scene/{look,service}.py`, `backend/app/features/billing/{plans,quota_service}.py`, `backend/app/routers/render_jobs.py`.
- Acceptance: a Free 8K still is 402; two simultaneous creates can't overspend; a repeated key returns the same job, a reused key with another body is 409; cancelling a queued job refunds it; a refund after a period rollover adds nothing; another user's download is 404; `/scenes/by-sku/…` has no renders.
- Tests: pytest `test_render_job_specs.py`, `test_render_job_credits.py`, `test_render_jobs_api.py` (extended), `test_scene_look.py` (inactive slug, someone else's `custom:` id, a `url(` background, a 65 KB look).

**A2. Worker protocol: heartbeats, uploads, outputs** (backend; after A1)
- Scope: claim by kinds, priority and running caps, `run_after`; payload with look, look items, model URL or path, watermark and limits; heartbeat with cancel and run-time limits; signed uploads and the local fallback; complete with outputs (prefix and size checks, `renders` rows, charge, storage bytes); fail with code, retryable and backoff; constant-time token checks; a token list; lease default 120 s; drop the old columns.
- Acceptance: a lease lives only as long as its heartbeats; a lapsed lease is taken back as a failed attempt; a key outside the job's prefix or a wrong size is 400; a second complete is 409 and charges nothing; a cancel shows up in the next heartbeat; a final failure refunds.
- Tests: `test_render_jobs_worker.py` ported, plus heartbeat, upload and complete cases.

**A3. Harness export mode and the worker build** (frontend; in parallel with A1 and A2, against a fixture payload)
- Scope: `useLookStage` taken out of `ViewerShell`; `page.worker.tsx` and `pageExtensions` under `BUILD_TARGET=worker`; probe and export modes for still and angle set (view, pose and angle cameras); the fixed clock; files and progress to the sink; the import rule; a golden on SwiftShader WebGPU (`--enable-unsafe-webgpu`) rendering an export-mode still from a fixture payload; a CI check that the public build has no harness.
- Files: `src/features/viewer/ui/{ViewerShell,RenderHarness}.tsx`, `src/features/viewer/ui/useLookStage.ts`, `src/features/render/harness/*`, `src/app/render-harness/page.worker.tsx`, `next.config.ts`, `scripts/check-feature-imports.mjs`, `scripts/golden/*`, `.github/workflows/ci.yml`, `tests/goldens/`.
- Acceptance: studio and embed goldens unchanged; the export-mode golden passes at SSIM ≥ 0.98; the public build has no `/render-harness`; the page reads no token.
- Tests: Vitest for camera resolution and look-to-stage mapping; goldens.

**A4. Worker: GPU Chrome, sink, uploads, image and compose** (worker; after A2 and A3)
- Scope: the worker modules; the three launch profiles and the self-check; slots, contexts, recycling, the network allowlist and asset cache; heartbeats and uploads; the Dockerfile; the two compose services; a short "run a worker" section in `scripts/render-worker/README.md`.
- Acceptance: on the chosen GPU host the probe reports the NVIDIA adapter and the WebGPU backend; with `--profile worker-cpu` and local storage, a still goes from create to download; a worker killed mid-job loses the job to another slot after the lease; a page request to a host off the allowlist is aborted; the Free mark matches the browser's reference.
- Tests: Node tests for the sink (token, backpressure) and the API client; `npm run worker:smoke` runs one still against a local stack.

### Phase B: video and spins

**B1. Turntable and spin specs** (backend; after A2): specs, caps, prices, run-time limits. Tests: spec and price cases, Free limits.

**B2. Frame loops in the harness** (frontend; after A3, in parallel with B1): turntable orbits from a view (`orbitStartFromView`, `turntableAngle`), cuts through poses, the pack's spin orbit; raw frames to the sink; `spin.html` from `spin-viewer.ts`. Tests: Vitest for the paths; a 12-frame golden strip.

**B3. Encoders in the worker** (worker; after B1 and B2): ffmpeg as above, ZIP streaming, progress from frames to heartbeats. Acceptance: a 1080p, 120-frame MP4 plays in Chrome, Safari and QuickTime; `ffprobe` shows High, yuv420p, BT.709 and the right frame count; frame 0 matches a still of the same camera at SSIM ≥ 0.97; an 8K, 30-frame clip encodes; a spin ZIP opens and `spin.html` turns.

### Phase C: switch the studio over, then delete the browser exports

**C1. Job plumbing and the Exports panel** (frontend; after A1, in parallel with A2 to A4): the Next routes, `render-jobs-api.ts`, `useRenderJob`, `ExportJobsPanel`, the Exports page, quoted credits, `lookSnapshot` shared with the autosave, the `server_exports` flag. Tests: Vitest for polling and the snapshot (it must equal the autosave payload).

**C2. Stills** (after A4 and C1): `HiResExportModal`, `EditorImageTab` single and multiple, Quick still, Set as thumbnail (`PUT /scenes/{id}/thumbnail`), the Settings tab's thumbnail. Acceptance: with the flag on, no still renders in the browser; with it off, today's behaviour.

**C3. Videos** (after B3 and C1, in parallel with C2): `Video360Modal`, `EditorVideoTab` simple, multi-angle and multiple; the WebCodecs warnings go.

**C4. Delete the browser exports** (after C2, C3 and D2): the removals listed above, the boundary rule in place of `export-parity.test.ts`, the flag removed. Acceptance: no public route imports the export pipeline (`check:boundaries`); `mediabunny` is gone; the smoke flow in `docs/QUALITY-GATES.md` uses an export job instead of `POST /renders`.

### Phase D: the Campaign Pack on the server

**D1. Pack spec, gate and price** (backend; after A2): the config check, Grow and Studio only, the sum of parts, the caps. Tests: a Free pack is 402; the default pack costs 49.

**D2. The pack in the harness and the dialog** (frontend and worker; after B3, in parallel with D1): `runner.ts` with a sink-backed `PackRenderBackend` (images, the ASET image, turntables through ffmpeg, spin frames), documents and manifest from `documents.ts`, the worker's ZIP; `CampaignPackDialog` creates a job; `start-pack.ts` and the in-browser download go. Acceptance: the default pack's ZIP has the same 251 to 252 entries and names as the browser's; re-skinned metals carry reflections; the dialog can close while the pack renders.

## Open questions

Work can start on these defaults; each is cheap to change before C2 ships.

| Question | Default |
|---|---|
| Credit prices | The `RENDER_CREDIT_COSTS` table above. Quick still 1 credit; thumbnails free. |
| Do Free exports stay? | Yes: up to 4K, marked, out of Free's 25 credits. |
| New video limits (Free 30 fps and 20 s; 8K up to 20 s; nothing above 60 fps) | As proposed. |
| GPU hosting provider and budget | Start with one NVIDIA L4-class host (24 GB) on a big cloud's on-demand price (roughly US$0.7 to 0.9 an hour at list; confirm), on during business hours, autoscaled up to 4 on queue depth; budget cap US$1,500 a month. Develop on a Mac with the `metal` profile. |
| How long outputs are kept | Renders stay until the user deletes them or their scene, and count toward storage; pack ZIPs and archives expire after 14 days. |
| Licensing of server-side H.264 | Counsel to confirm the AVC patent pool position for encoding customers' videos; proceed with x264 meanwhile, and keep VP9/WebM as the fallback. |
| Watermark or block the live viewer | No: it stays clean; screenshots are accepted. |
| Most jobs per bulk request in the studio | 100. |
