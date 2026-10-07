# ADR 0006: Bulk pipeline, from CAD files to published pieces

## Status

Proposed (2026-10-03). Builds on [ADR 0005](0005-server-exports.md) (server export jobs). The product owner's decision: a customer drops in hundreds of CAD files and gets back, for each design, stills from several angles, a public embed link and a 360° turntable video, plus a manifest; later, the same through an API.

## Context

### What exists

- **Conversion runs only in a browser tab.** `src/lib/convert/` loads each format with its own loader: 3DM with rhino3dm (WASM from jsDelivr, a 4-worker pool, a 120 s limit); STEP and IGES with occt-import-js (about 7.6 MB of WASM from jsDelivr, in a Worker); OBJ, FBX, STL, PLY and 3MF with three.js loaders; GLB and glTF with `GLTFLoader` (Draco decoder from gstatic). It segments metal and stones, normalises units, stamps slots, exports a GLB and renders a 512 px WebP thumbnail (`convertUploadToGlb` in `to-glb.ts`).
- **Uploads are one model at a time, reviewed by hand** (`src/features/upload/`): drop a file, review layers, fill name, SKU (`skuFromFilename`, at most 64 characters of `[A-Za-z0-9._-]`), category (default "Ring"), click "Decimate metal" if over the plan's polygon cap, Save. Save converts, presigns twice (GLB and thumbnail), PUTs both and registers (`src/lib/upload/persist-model.ts`).
- **Limits that stop bulk.** 1 model credit per design (Free 3, Grow 75, Studio 500 a month). The presign limit is 30 an hour, enforced twice, in memory per process: in FastAPI (`backend/app/core/rate_limit.py`) and in the Next route (`src/lib/rate-limit.ts`). With two presigns per upload, that is about 15 designs an hour. Presigned PUTs carry no size condition; only the direct upload is capped (100 MB).
- **SKUs are unique across the platform** (`scenes.sku` has a unique index), because the embed URL is `/embed/<SKU>`. Upload checks it (409); `PATCH /scenes` doesn't, so a taken SKU there hits the index and answers 500.
- **Lists don't scale.** `GET /scenes` returns every scene; the dashboard filters and pages them in the browser (`src/lib/dashboard/filters.ts`), and `ModelMultiSelect` lists them all. For each scene with a SKU, `_scene_model_url` and `_scene_thumbnail_url` ask storage whether the published file exists: two storage calls per published piece per list. `publish_scene_to_public` copies the GLB and thumbnail on every `PATCH`, and the studio autosaves about 350 ms after every change.
- **Server render jobs** exist and ADR 0005 turns them into export jobs with looks, cameras, videos, credit holds and a GPU worker.
- **The harness can already convert.** `/render-harness?export=1&model=…` runs `inspectModelFromFile` + `convertUploadToGlb` and hands the GLB to Playwright as a download (`scripts/golden/export-fixture.mjs`).

### What the conversion code told us

- The harness export mode skips what Save does on top of conversion: no decimation, no thumbnail, no model config, no polygon count; `materialProps` is a placeholder. GLB and glTF inputs skip conversion entirely, so a `.glb` job would output nothing. The file name comes from the URL, so a signed URL with a query string fails the extension check.
- **Units.** `model-units.ts` takes the declared unit if it gives a piece 1.5 to 1000 mm long, else treats a plausible raw size as millimetres, else picks the factor closest to a 25 mm piece. Unitless formats (OBJ, STL, PLY) start at the second step, so a ring drawn in centimetres (2.1 units) is taken as 2.1 mm. The stored GLB is not in millimetres: `fitModelToUnit` scales the root to a 1.4-unit longest side, and the real size survives only in the root node's extras (`devjewelsUnits`), not in `model_config`.
- **Roles.** Each mesh carries `jewelryRole` (`metal`, `gem`, `accent-gem`) in the GLB's extras; `model_config.slots[].kind` (`metal`, `gem`, `accent`, `default`) comes from the slot id's prefix (`Heads` and `Metal N`, `Gem N`, `Accent N`; mirrored by `_slot_kind` in `backend/app/services/model_config.py`). They agree for shape-segmented files but not always for 3DM: a layer named "Pave" gets the gem role but a `default` slot, which defaults to gold.
- **Compression** (meshopt and Draco through glTF-Transform, `compress-glb.client.ts`) probably fails silently in the browser: the fixture exported through the harness has no compression extensions, and `draco3dgltf` ships Node builds that look for a WASM file Next doesn't serve. Not run; E2 confirms.
- A thumbnail failure fails the whole conversion (no `try`), and the converters fetch WASM from public CDNs on every page load.

### Target

1. The customer drops files (several, a folder or a ZIP), with an optional CSV mapping each file to SKU, name and category, picks a look and a render plan, sees the price, and uploads.
2. Files go straight to private storage through signed PUTs, many per request.
3. A `convert` job per design runs the existing conversion in the worker's harness, in millimetres, splitting metal and stones, decimating to the plan's cap, and making a thumbnail. Its completion creates the scene with its SKU, applies the look by slot role, and publishes it.
4. The batch's render plan then creates export jobs per design: an angle set, a turntable, optionally a spin.
5. A batch page shows progress per stage and lets the customer retry or cancel; the result is a manifest CSV (SKU, name, embed URL, still URLs, video URL) and an optional ZIP.
6. Later, the same over a versioned API with keys and signed webhooks.

## Decision

### Shape

```
/bulk/new (browser)                    API                                   Worker (ADR 0005)
files, folder or ZIP + CSV  ──────▶  POST /ingest/batches: validate items,
                                     SKUs, formats, sizes; quote credits
signed PUTs, 4 at a time  ◀──────▶   POST …/uploads (≤ 100 URLs a call)
confirm each upload  ─────────────▶  HEAD: size and type
submit  ──────────────────────────▶  hold model + render credits;
                                     queue a convert job per design  ──▶  harness ?mode=convert (CPU pool)
                                     complete: create scene, apply    ◀──  GLB, thumbnail, conversion.json
                                     look by role, publish SKU;
                                     queue the render plan's jobs  ─────▶  angle set, turntable, spin (GPU pool)
/bulk/<id> (progress)  ◀── poll ──   item and batch status            ◀──  outputs as scene renders
manifest.csv, ZIP  ◀──────────────   GET …/manifest.csv, archive job
```

The batch is a list of designs; each design (an item) moves through upload, conversion and rendering on its own, so one bad file never holds up the other 499.

### Tables

`ingest_batches`:

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `user_id` | FK `users`, CASCADE | |
| `name` | varchar(255) | |
| `status` | varchar(24) | `draft`, `processing`, `completed`, `completed_with_errors`, `canceled` |
| `source` | varchar(8) | `studio` or `api` |
| `look_template` | JSON | validated (see Look templates) |
| `render_plan` | JSON | validated (see Render plans) |
| `options` | JSON | `{ "publish_media", "decimate": "auto" \| "fail", "default_category" }` |
| `item_count` | int | |
| `idempotency_key`, `request_hash` | varchar(128), char(64) | unique `(user_id, idempotency_key)` |
| `archive_keys` | JSON | ZIP parts, when made |
| `created_at`, `updated_at`, `submitted_at`, `finished_at` | timestamp | |
| `expires_at` | timestamp | when raw CAD files and archives are deleted |

`ingest_items`:

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `batch_id` | FK, CASCADE | |
| `user_id` | FK | for ownership checks without a join |
| `position` | int | order in the drop |
| `filename` | varchar(512) | relative path as dropped |
| `source_key` | varchar(512) | `customers/<user>/ingest/<batch>/<item>/<clean name>` |
| `source_bytes` | bigint | declared, then checked |
| `companions` | JSON | `[{filename, key, bytes}]`: an OBJ's MTL, a glTF's `.bin` |
| `sku`, `name`, `category`, `note` | | from the CSV, else from the file name |
| `units` | varchar(8) | `auto`, `mm`, `cm`, `in`, `m` |
| `status` | varchar(16) | below |
| `error`, `error_code` | | |
| `attempts` | int | item retries |
| `scene_id` | FK `scenes`, SET NULL | once converted |
| `convert_job_id` | FK `render_jobs`, SET NULL | |
| `model_credit_held`, `render_credits_held` | smallint, int | credits not yet moved to a job |
| `polygon_count`, `size_mm` | int, real | after conversion |
| `warnings` | JSON | unit guesses, decimation, skipped layers |
| `created_at`, `updated_at` | timestamp | |

Indexes: `ingest_batches (user_id, created_at)`; `ingest_items (batch_id, status)`, `(batch_id, position)`, unique `(batch_id, sku)`; and a partial unique index on `ingest_items (sku)` while the item is still in progress (`status NOT IN ('done', 'failed', 'skipped', 'canceled')`), which reserves the SKU across batches until the scene holds it.

`render_jobs` gains `ingest_item_id` (FK, SET NULL, indexed) beside ADR 0005's `batch_id`, so each item knows its jobs.

Item statuses:

```
awaiting_upload ─confirm─▶ uploaded ─submit─▶ converting ─▶ converted ─▶ rendering ─▶ done
        │                                │                       │
        └─expired─▶ skipped              └──────────▶ failed ◀────┘      any ─cancel─▶ canceled
```

A batch is `draft` until it is submitted, `processing` while any item is unfinished, then `completed` (every item `done`) or `completed_with_errors`; or `canceled`. Its counts are a `GROUP BY status` over its items, not counters that can drift.

### Uploading in bulk

`/bulk/new` is a new page in a new feature, `src/features/bulk/`, in four steps:

1. **Drop.** Several files (`<input multiple>`), a folder (`webkitdirectory`, and dropped folders through `webkitGetAsEntry`), or ZIPs, which the browser expands with fflate's streaming `Unzip`; the server never unzips anything. An optional CSV.
2. **Map and check.** A table of designs: each CAD file with its companions (an OBJ's MTL, a glTF's `.bin`), matched to a CSV row by relative path, else by a unique file name, case-insensitive. Without a CSV, name and SKU come from the file name (`stemFromFilename`, `skuFromFilename`). Problems show inline before anything uploads: an unsupported format, a file over the size limit, a CSV row with no file, a SKU repeated in the batch, a SKU already taken or reserved (`POST /ingest/sku-check`), a SKU outside `[A-Za-z0-9._-]{1,64}`.
3. **Look and plan.** A look template (from a finished piece or the default studio look) and a render plan (angles, still size and format, turntable on or off and its length, spin on or off, publish media), with the price in model and render credits and the balance after it.
4. **Upload.** Four signed PUTs at a time, each retried with backoff; a progress bar per file and in total. Leaving the page pauses; coming back resumes with the items still `awaiting_upload`. The batch is submitted when the uploads finish (or by hand, leaving the rest to upload later).

The CSV, UTF-8, at most 1 MB, one row per design; only `file` is required:

```csv
file,sku,name,category,note,units
rings/R-1001.3dm,R-1001,Solitaire 1 ct,Ring,,
pendants/P-220.stp,P-220,Halo pendant,Pendant,Bestseller,
earrings/E-17.stl,E-17,Huggies,Earrings,,mm
```

`category` must be one of `JEWELRY_CATEGORIES` (`src/lib/upload/categories.ts`), else the batch default; `units` is for unitless formats.

### Endpoints for batches

| Method and path | Does |
|---|---|
| `POST /ingest/batches` | `{ name, items: [{ filename, bytes, companions, sku, name, category, note, units }], look_template, render_plan, options }` with `Idempotency-Key`. Validates everything and answers 201 with the batch, its items and `quote: { model_credits, render_credits }`, or 422 with a problem per item |
| `POST /ingest/sku-check` | `{ skus: [...] }` (≤ 1000) → the ones taken or reserved |
| `POST /ingest/batches/{id}/uploads` | `{ item_ids }` (≤ 100) → a signed PUT per file and companion: 15 minutes, `Content-Length` and `Content-Type` signed in, so the upload must be the declared size. One rate-limit hit per call, not per file |
| `POST /ingest/batches/{id}/uploaded` | `{ item_ids }`: the API checks each object exists with the declared size and moves the item to `uploaded` (or queues its conversion if the batch is already submitted) |
| `POST /ingest/batches/{id}/submit` | Holds the credits and queues the conversions |
| `GET /ingest/batches`, `GET /ingest/batches/{id}` | Lists and one batch with counts per status and credits held, charged and refunded |
| `GET /ingest/batches/{id}/items?status=&page=&limit=` | Items, 50 a page |
| `POST /ingest/batches/{id}/items/{item_id}/retry`, `POST /ingest/batches/{id}/retry-failed` | Retries failed items from the stage they failed in |
| `POST /ingest/batches/{id}/cancel` | Cancels what hasn't finished and refunds it |
| `GET /ingest/batches/{id}/manifest.csv` | The manifest |
| `POST /ingest/batches/{id}/archive`, `GET /ingest/batches/{id}/archive/{part}` | Builds the ZIP parts; 302 to a signed URL for a part |

All of it lives in `backend/app/features/ingest/` (`service.py`, `templates.py`, `render_plans.py`, `manifest.py`) behind a thin `backend/app/routers/ingest.py`, under the `upload` feature flag plus a new `bulk_upload` flag.

### Limits for batches

- Formats: `SUPPORTED_MODEL_SUFFIXES` (`backend/app/features/upload/service.py`), plus `.mtl` and `.bin` as companions. Texture images are ignored: conversion replaces every material, and only names help find stones.
- At most 100 MB a file (as the direct upload today), a batch of at most 500 designs and 20 GB on Studio, 100 designs and 5 GB on Grow; Free has no bulk upload. At most 3 unfinished batches per user.
- Items not uploaded within 24 h of submitting are `skipped` and refunded.
- Raw CAD files are private, not counted toward storage, and deleted 30 days after the batch finishes (`expires_at`); the GLBs, thumbnails and renders made from them count, as uploads do.

### SKUs

One helper, `assert_sku_available(db, sku, user_id, item_id=None)` in `backend/app/features/scene/skus.py` (the scene feature owns SKUs), decides whether a SKU is free: no scene holds it and no unfinished item, other than the one asking, reserves it. Upload (register and direct), `PATCH /scenes` (409 instead of today's 500) and batch creation all call it. A batch checks every SKU when it is created, before anything uploads or is held. The partial unique index closes the race between batches; the scene's unique index closes the race with a plain upload, and an item that loses it fails with `sku_taken`, refunded. SKUs stay case-sensitive, as today.

### Conversion jobs

A `convert` job (ADR 0005's queue, priority 10) per design:

```json
{
  "item_id": 9001,
  "source": { "key": "customers/7/ingest/31/9001/R-1001.3dm", "filename": "R-1001.3dm", "bytes": 4200000 },
  "companions": [],
  "units": "auto",
  "max_polygons": 2000000,
  "decimate": "auto",
  "thumbnail": { "size": 512, "format": "webp" }
}
```

The worker downloads the source and companions, serves them to the page through its sink (`/inputs/source/<filename>`, so the `File` keeps its real name), and opens `/render-harness?mode=convert`. The page runs what Save runs today, not just what the old export mode ran:

1. `inspectModelFromFile(file, { companions })`, then `buildParsedUpload`, moved from `src/features/upload/lib/parsed-upload.ts` to `src/lib/upload/` so the upload page and the harness share it. GLB and glTF go through it too; the shortcut that skipped them goes.
2. Units: `units` overrides the guess for unitless files; the decision and the real size are kept.
3. Over the cap with `decimate: "auto"`: `decimateModelRoot` (metal only, as the button does), then count again. Still over (stones alone exceed it), or `decimate: "fail"`: the job fails with `over_polygon_cap`, not retried.
4. `buildLayerRows` and `syncModelConfigFromLayers`, then `convertUploadToGlb(file, { modelConfig, preloaded })` with the thumbnail on, its failure a warning instead of an error.
5. Three files to the sink: `model.glb`, `thumbnail.webp`, and `conversion.json`: `{ model_config, slot_selections, polygon_count, units: { mm_per_unit, source, size_mm }, roles: { "<slot>": "metal" | "gem" | "accent" }, warnings }`. `roles` is the majority `jewelryRole` of each slot's meshes.

The worker then compresses the GLB in Node with glTF-Transform (meshopt; the packages are already server-side in `next.config.ts`) when `INGEST_COMPRESS_GLB` is on, since the browser path likely doesn't compress, uploads the three files, and completes the job.

Conversion needs no GPU beyond a 512 px thumbnail, so `convert` jobs go to a CPU pool: the same image with the `swiftshader` profile, claiming `kinds: ["convert", "batch_archive"]`. The converters' WASM (rhino3dm 8.17.0, occt-import-js 0.0.23, Draco 1.5.5) is baked into the image and served through the worker's `context.route` cache in place of jsDelivr and gstatic, so conversions don't depend on public CDNs and don't download 8 MB per design.

On `complete`, the API creates the scene with one function shared with the upload flow, `create_scene_from_glb` (taken out of `register_after_presign` and `save_direct_multipart` in `backend/app/features/upload/service.py`). It counts the GLB's triangles against the cap (`count_glb_triangles`), applies the strict GLB checks from `fix/strict-model-uploads`, checks storage, takes the SKU (`assert_sku_available`), consumes the item's held model credit, stores `model_config` with `units` and each slot's `role`, applies the batch's look template, publishes the scene, and queues the render plan's jobs.

As built in E2:

- **One Save.** `src/lib/upload/` holds every step between a dropped file and a stored one, and the upload page and the convert mode (`src/features/render/harness/convert-design.ts`) both call them: `buildParsedUpload`, `decimateParsedUpload` (the Decimate button), `layerRowsOf`, `convertParsedUpload` (Save's conversion, returning the GLB, thumbnail, merged model config, selections and count) and `slotRoles`. For both, a thumbnail that fails is now a warning, and selections name only slots the model config has (an empty Rhino layer got one before). The smoke checks the upload page stores the GLB the worker makes of the same file, byte for byte.
- **Compression worked nowhere in the browser.** It was confirmed failing: draco3dgltf's Emscripten builds looked for their WASM beside the chunk that loaded them, which 404s, so every upload went out uncompressed. Both now get their WASM from webpack's emitted assets (`locateFile`), and the upload page and the convert mode compress (meshopt and Draco). The worker does no compression of its own, and `INGEST_COMPRESS_GLB` isn't needed.
- **Units.** `model.glb` is the upload page's GLB, fitted to the viewer's 1.4 units; its size in millimetres is `conversion.json`'s `units.size_mm` and the root's `devjewelsUnits` extras. `units` applies only to files that declare none (OBJ, STL, PLY), as the API already insists, recorded as source `override`.
- **Inputs.** The sink serves the design's files at `/inputs/source` and `/inputs/companions/<n>`; each `File` takes its name from the spec. The worker checks each is the size it was uploaded with and sniffs the source.
- **The converters' files are vendored** in the image (`scripts/render-worker/vendor.mjs` pins each by SHA-256, the image build fetches and checks them) and answered from there; a convert job's page may reach no asset origin at all. A worker that converts claims nothing without all of them.
- **The CPU pool** is the `worker-convert` service: the same image, the `swiftshader` profile, `WORKER_KINDS=convert` (`batch_archive` waits for F3). `npm run worker:smoke-convert` runs a batch of fixtures (`tests/convert/`) through it end to end.

### Look templates by slot role

A template names materials by role, not by slot, so one template fits every design whatever its slots are called:

```json
{
  "lighting": "studio",
  "finish": "polished",
  "materials": { "metal": "gold-18k-yellow", "gem": "diamond", "accent": "diamond" },
  "scene_settings": {
    "ENVIRONMENT-METAL": "studio-softbox", "ENVIRONMENT-GEM": null, "BACKGROUND": "paper-white",
    "GROUND": "shadow-soft", "quality_mode": "photometric", "sceneSetup": null,
    "advanced": { "exposure": 1.0 }
  }
}
```

- Each slot's role comes from `conversion.json` (the meshes' `jewelryRole`), and for scenes made before it from `kind` (`metal` and `default` → metal, `gem` → gem, `accent` → accent). `model_config.slots[]` gains a `role` field; the studio keeps using `kind`.
- Applying it: `slot_selections[slot] = materials[role]`, falling back to `materials.metal`; the template's lighting, finish and scene settings replace the defaults. Poses, model transform and embed settings are not part of a template.
- Material values are validated as in ADR 0005's `validate_look`: presets, active catalogue items, the user's own library materials.
- **From a finished piece:** `POST /ingest/look-templates/from-scene/{scene_id}` reads the scene's look and, for each role, takes the material most of its slots of that role use. The upload page offers it as "Use the look of…" with a scene picker.
- Templates are stored on the batch. A table of named templates waits until API customers need to reuse one by id (see Open questions).

As built in F1 (`backend/app/features/ingest/templates.py` and `saved_templates.py`, `backend/app/features/scene/slot_roles.py`):

- **Roles.** Completing a conversion stores a `role` on every slot of the model config: `conversion.json`'s, else its kind's (`role_of_slot`). Uploads and scenes made before get theirs from `kind` when a template is made of them; nothing is backfilled. `role` is a field of a look's slot config, so a render job's copy of the look keeps it.
- **Two metals of one role.** Beside each role's material, a template keeps `slot_materials`: by role, then slot name, each slot of its scene whose material isn't its role's. A two-tone ring (`Metal 1` in yellow gold, `Heads` in white) makes `"materials": { "metal": "gold-18k-yellow", "gem": "diamond" }, "slot_materials": { "metal": { "Heads": "gold-18k-white" } }`: a design with a `Heads` slot of role metal gets the white gold there, and every other metal slot the yellow. With materials by role alone, the majority rule kept one metal of the two. A role's material is the one most of its slots have; a tie goes to the first slot in the model config's order, `Heads` last, so the band gives the metal for slots of names the template doesn't know.
- **No material for a role.** A slot whose role the template has no material for (a halo's accents under a solitaire's template) keeps the converter's selection, and its design gets a warning naming the slots. Falling back to `materials.metal` would have put a metal on stones.
- **Templates are named and kept** in a table after all, `look_templates` (owner, name, the template, the scene it was made of, which may go): the page picks one by id and never sends a template, and the API can reuse them later. `POST /ingest/look-templates/from-scene/{scene_id}` makes one of the caller's scene (201) or brings that scene's template up to date (200; one a scene); another's scene is 404, and a look that can't be a template (a material the catalogue has retired) is 400 naming the field. `GET /ingest/look-templates` lists the caller's, latest first, each with its materials' names (`labels`) and the catalogue items and library materials it names (`look`), for the swatches. `POST /ingest/batches` takes `look_template_id`: 404 for another's template, checked again (400 for a material retired since), and the batch keeps that checked copy in `look_template`, which the batch view shows; changing the template later changes no batch.
- **What a template carries:** lighting, finish, and the scene settings that make a look: the catalogue's environments, background and ground, `VJSON`, `quality_mode`, `sceneSetup`, `advanced`, and `customBackground` (a colour, or one of the owner's background images by its link, as scenes keep it). The checks are `validate_look`'s own: `check_material_refs`, `check_setting_slugs` and `background_image_id` in `backend/app/features/scene/look.py`.
- **The studio** keeps going by `kind`, but no longer turns a stone on a slot of kind `default` into gold (`coerceByRole` in `src/lib/slot-materials/material-rules.ts`), so the Pave layer's diamonds show in the studio, the embed and server renders. Its pickers still list such a slot with the metals.
- **The picker** on `/bulk/new` (`LookTemplatePicker`): the studio's default, the latest templates in the designer's swatch style (`MaterialSwatch`, in a new `static` form, by role, with a slot's own under its name), and "Use the look of…", a search of the user's scenes (`useScenePages`, shared with `ModelMultiSelect`) that makes the scene's template and picks it.

### Render plans

```json
{
  "stills": { "angles": ["front", "three-quarter", "side", "top"], "size": 2000, "format": "jpeg", "jpeg_quality": 0.92, "transparent": false, "margin_pct": 8 },
  "turntable": { "width": 1080, "height": 1080, "fps": 30, "seconds": 6, "quality": "high" },
  "spin": null,
  "publish_media": true,
  "thumbnail_from": "front"
}
```

When a design's scene is created, the plan becomes ADR 0005 export jobs with `batch_id`, `ingest_item_id`, priority 10 and the scene's saved look: one `angle_set` (angle cameras with auto-framing), one `turntable` (the pack's orbit: elevation 20°, from 35°), and a `spin` if asked. Angles are the pack's built-ins; sizes and lengths are capped by the plan as in ADR 0005.

- When the angle set completes, the API makes a 512 px WebP from the `thumbnail_from` still with Pillow, sets it as the scene's thumbnail and republishes, so the dashboard and the embed show the piece in its template look rather than the converter's plain thumbnail.
- With `publish_media`, each output of a design with a SKU is also copied to the public bucket at `published/<user>/<sku>/media/<job>/<file>`. The job id in the path keeps a re-render from being hidden behind the year-long cache that published files get (ADR 0004 notes the problem for GLBs).
- An item is `done` when its jobs have completed, `failed` when its conversion or any job failed for good; the outputs that did finish stay.

As built in F2:

- **Fan-out.** The conversion's completion queues the design's jobs in its own commit (`ingest/renders.py`), on `validate_look(saved_look(scene))`: the look the scene was saved with, a look template's included. Each job is an ADR 0005 job (priority 10, the owner's running cap and watermark, 3 attempts) for the scene, the batch and the design. A design moves `converting → rendering` in that commit, so `converted` is only ever seen inside it; a conversion completed twice is a 409 and queues nothing again. A look that no longer validates fails the design (`invalid_spec`), its render credits refunded and its scene kept.
- **Credits.** The design's held render credits move onto its jobs (`share_held`: each job its own price, which adds up to the hold unless prices changed since the batch was priced), each with its share of the bought ones and the allowance generation of the hold, so the jobs charge and refund as every job does and a batch charges exactly its quote. `GET /ingest/batches/{id}` gives credits `held` (by designs and jobs), `charged` (a model credit per scene made, the render credits jobs charged) and `refunded` (what designs were given back, `ingest_items.*_refunded`, and refunded jobs).
- **Statuses.** A design is `done` once the newest job of each kind has completed and `failed` as soon as one ends failed or canceled (a render its owner cancels too); its other jobs run on and keep what they make. A batch settles only once none of its designs is unfinished and none of its jobs is queued or running.
- **Retries.** A job's own retries are ADR 0005's. Retrying a failed design whose scene was made holds the price of the parts that didn't complete and queues new jobs for them alone; the newest job of a kind stands for it. One without a scene converts again, as in E1.
- **Cancel.** Queued jobs end canceled and refunded at once, running ones are asked to stop through the heartbeat, and designs give back what they still hold; a second pass after the commit stops jobs a conversion queued while the cancel ran. Every change locks jobs, then designs, then the billing row, then the batch; lapsed leases are taken back one job a transaction to keep that order.
- **Checks and price.** The plan is checked again at submit and at retry against the owner's current caps (402). `POST /ingest/render-plan/quote` prices a plan for `/bulk/new` as creating a batch would (400, 402).
- **The turntable** goes once round the piece from the three-quarter angle (35° round, 24° up, framed for that view): a turntable job's path can't take the pack's orbit (20° up, fitted at every azimuth).
- **`publish_media` is off by default**: outputs stay private and download through the API unless the plan asks. `renders.public_key` keeps each public copy, which deleting the scene removes.
- **The embed link**, `APP_PUBLIC_URL/embed/<SKU>` as the studio builds it, is kept on the design (`ingest_items.embed_url`) when its scene is made; a design that is done has its scene published again if its publish had failed.
- **The pages.** `/bulk/new` picks the plan with the Campaign Pack's pickers, the ADR's default plan to start (four 2000 px stills and a 6 s 1080² turntable, 7 credits a design), and shows the API's price; `/bulk/<id>` shows each design's jobs (the shared `RenderJobStatusBadge`, `RenderJobProgress` and `RenderJobDownloads`), its thumbnail and its embed link.

### Credits for a batch

Submitting holds everything the batch can spend, in one transaction, with ADR 0005's atomic hold:

- model credits: 1 per design (`model_credits_balance`, which uploads consume today with the same read-then-write `consume_model_credit`; the hold replaces it);
- render credits: the render plan's price per design (ADR 0005's `RENDER_CREDIT_COSTS`) × designs. The default plan above costs 4 (four 2000² stills) + 3 (6 s at 1080²) = 7 render credits a design.

Not enough of either: 402 with the shortfall, before any work starts. The hold sits on each item (`model_credit_held`, `render_credits_held`); creating the scene consumes the model credit, and fanning out moves the render credits onto the jobs, which charge or refund them as in ADR 0005. A failed, skipped or canceled item gets back whatever it still holds.

### The batch page

`/bulk/<id>`, polling every 5 s while the batch runs:

- A header with the batch name, counts per stage (uploaded, converting, rendering, done, failed), a progress bar, and credits held, charged and refunded.
- A table of designs, 50 a page, filtered by status: thumbnail, SKU, name, status, the error in words (`sku_taken`, `over_polygon_cap`, `model_unreadable`, `timeout`), and per row "Open in studio", "Copy embed link" and "Retry".
- Actions: retry failed designs, cancel what hasn't finished, download the manifest, build and download the ZIP.
- The dashboard lists recent batches with their status.

Retries rerun a design from where it failed: a failed conversion re-queues the conversion; a failed render re-queues only that job. A retry holds credits again for what it reruns. Uploads that fail stay `awaiting_upload` and can be re-sent from the same page.

### Results

The manifest, `GET /ingest/batches/{id}/manifest.csv`, is built from the database on each request (500 rows is small), so it is always current:

```csv
sku,name,category,status,embed_url,still_front,still_three_quarter,still_side,still_top,turntable_mp4,spin_zip,error
R-1001,Solitaire 1 ct,Ring,done,https://studio.mist.com/embed/R-1001,https://cdn…/published/7/R-1001/media/4812/front.jpg,…,https://cdn…/turntable.mp4,,
P-220,Halo pendant,Pendant,failed,,,,,,,,over_polygon_cap: stones alone are 2.4M triangles
```

- The embed URL is `APP_PUBLIC_URL/embed/<SKU>`. Media URLs are the public copies with `publish_media`; without it they are the API's download links, which need a signed-in user or an API key.
- Cells that start with `=`, `+`, `-` or `@` get a leading `'`, so a design named `=HYPERLINK(…)` can't run in a spreadsheet.
- The ZIP is a `batch_archive` job on the CPU pool: it streams each design's outputs from storage into ZIP parts of at most 2 GB (`<SKU>/stills/front.jpg`, `<SKU>/video/turntable.mp4`, `<SKU>/spin/…`, with `manifest.csv` in the first part), uploads them privately, and the batch page links each part through a signed URL. Parts expire after 14 days.

### Fixing what doesn't scale

These ship first and help today's users too (Phase E0):

1. **Paged scene lists.** `GET /scenes?q=&category=&page=&limit=` (limit ≤ 100) returns `{ items, total, page, limit }`, searching name, SKU, note and category in SQL, with an index on `scenes (user_id, updated_at)`. The dashboard's `DashboardFilters` already speaks `q`, `category`, `page` and `limit`, so `loadDashboardData` passes them through and `filterScenes`/`paginateScenes` go; `ModelMultiSelect` gets a search box and pages.
2. **No storage calls in lists.** `scenes.published_at` is set when `publish_scene_to_public` succeeds and cleared when the SKU is removed; URLs come from it. A one-off script backfills it with one existence check per scene. Publishing runs only when the model, thumbnail or SKU changed, not on every autosave.
3. **A rate limiter shared across processes.** A Postgres table, `rate_limit_counters (key, window_start, count)`, counted with `INSERT … ON CONFLICT … DO UPDATE SET count = count + 1 RETURNING count`, behind the same `rate_limit_dependency`; a daily delete clears old windows. The Next proxies stop limiting signed-in routes a second time (the backend is the authority) and keep their limiter for sign-in and sign-up. Batch endpoints count one hit per call.
4. **SKU checks and deletes.** `assert_sku_available` everywhere (no more 500 on `PATCH`); deleting a scene deletes its files (model, thumbnail, renders, published copies) and releases its storage bytes, which nothing does today. 500-design batches make both matter.

### The customer API (Phase G)

**Keys.** A new table, `api_keys`:

| Column | Notes |
|---|---|
| `id`, `user_id`, `name` | |
| `prefix` | 8 characters, unique; shown in the UI to tell keys apart |
| `key_hash` | HMAC-SHA-256 of the whole key with a server secret (`API_KEY_PEPPER`); the key itself is never stored |
| `scopes` | JSON: `batches:read`, `batches:write`, `render_jobs:read`, `render_jobs:write`, `scenes:read`, `webhooks:write` |
| `created_at`, `last_used_at`, `expires_at`, `revoked_at` | |

A key looks like `mist_<prefix>_<32 random bytes, base62>`. It is shown once when created, on the profile page, which also lists, renames and revokes keys (at most 10 per user). Revoking takes effect on the next request.

**Auth.** `/v1/*` takes only API keys (`Authorization: Bearer mist_…`), and API keys work only on `/v1/*`; sessions and keys never cross. A dependency, `api_principal(scope)`, finds the key by prefix, compares the hash in constant time, checks the scope, and rate-limits per key with the shared limiter (proposed: 600 reads and 60 writes a minute).

**Endpoints.** A versioned, documented surface (`/v1/openapi.json` and a docs page); additions stay in v1, breaking changes go to `/v2`. Errors are `{ "error": { "code": "insufficient_credits", "message": "…", "details": { … } } }` with stable codes.

| Method and path | Does |
|---|---|
| `POST /v1/batches` | Same body as `POST /ingest/batches`; answers with the batch and a signed PUT per file |
| `POST /v1/batches/{id}/uploads` | More signed PUTs (≤ 100), e.g. after some expired |
| `POST /v1/batches/{id}/uploaded`, `POST /v1/batches/{id}/submit`, `POST /v1/batches/{id}/cancel` | As in the studio |
| `GET /v1/batches`, `GET /v1/batches/{id}`, `GET /v1/batches/{id}/items?status=&cursor=` | Batches and items, cursor-paged |
| `POST /v1/batches/{id}/items/{item_id}/retry` | |
| `GET /v1/batches/{id}/manifest.csv`, `GET /v1/batches/{id}/manifest.json` | |
| `POST /v1/render-jobs`, `GET /v1/render-jobs`, `GET /v1/render-jobs/{id}`, `POST /v1/render-jobs/{id}/cancel` | ADR 0005's jobs on existing scenes |
| `GET /v1/outputs/{render_id}/download` | 302 to a signed URL |
| `GET /v1/scenes?cursor=`, `GET /v1/scenes/{id}` | |
| `POST /v1/webhooks`, `GET /v1/webhooks`, `DELETE /v1/webhooks/{id}`, `POST /v1/webhooks/{id}/test`, `GET /v1/webhooks/{id}/deliveries` | |

**Idempotency.** Every `/v1` `POST` that creates something requires `Idempotency-Key`, held on what it created (`render_jobs`, `ingest_batches`, `webhook_endpoints`) as in ADR 0005: the same key and body give the same answer, another body gets 409. State changes (`submit`, `cancel`, `uploaded`) are idempotent by state and need no key.

**Webhooks.** Two tables. `webhook_endpoints`: `user_id`, `url` (HTTPS only), `secret` (32 random bytes, encrypted at rest with `WEBHOOK_SECRET_KEY`, shown once), `events`, `active`, `failing_since`. `webhook_deliveries`: `endpoint_id`, `event_id` (UUID), `event_type`, `payload`, `status`, `attempts`, `next_attempt_at`, `last_status_code`, `last_error`, `delivered_at`.

- Events: `batch.completed`, `batch.item.completed`, `batch.item.failed`, `render_job.completed`, `render_job.failed`. The payload is the same JSON as the matching `GET`.
- Each delivery is a `POST` with `MIST-Event-Id` and `MIST-Signature: t=<unix time>,v1=<hex HMAC-SHA-256 of "<t>.<body>">`; receivers check it and reject a time more than 5 minutes off.
- A small dispatcher process, `python -m app.workers.webhooks` (a new compose service), claims due deliveries with `FOR UPDATE SKIP LOCKED`, the queue pattern `render_jobs` uses. It resolves the host and refuses private, loopback and link-local addresses, follows no redirects, and waits at most 10 s. It retries at 1 min, 5 min, 30 min, 2 h, 6 h and 12 h, then marks the delivery failed; an endpoint failing for 3 days is turned off and its owner emailed.

### Security

On top of ADR 0005's:

- **Raw CAD never touches the API process.** The API checks names, declared sizes and the stored size; parsing happens only in the worker's sandboxed browser. The worker sniffs magic bytes before parsing (`glTF`, `ISO-10303-21`, the Rhino and FBX headers) and fails a mismatch with `model_unreadable`.
- **Sizes are signed into every upload URL**, and checked again when the upload is confirmed; ZIPs are expanded only in the customer's browser.
- **Every item is the caller's**: batch, item, scene and output lookups filter by `user_id` and answer 404 otherwise.
- **SKUs** are checked up front and reserved; a scene SKU can't be stolen by a batch or the other way round.
- **Manifests** escape spreadsheet formulas.
- **API keys** are hashed with a pepper, scoped, revocable and rate-limited; **webhook** secrets are encrypted, signatures carry a time, and the dispatcher can't be pointed at internal addresses.
- **Abuse**: credits held before work, batch and file caps per plan, three open batches per user, a shared rate limiter, and the `bulk_upload` flag to turn it all off.

## Consequences

- A Studio customer can turn 500 CAD files into published, rendered pieces in one sitting instead of about 33 hours of 15-an-hour uploads, and later from their own systems.
- Conversion moves from the customer's tab to our workers: the converters become hermetic, units and roles are recorded, and the upload page and the harness share one Save path.
- The default plan costs 7 render credits and 1 model credit a design: 3,500 render credits for 500 designs, more than Studio's 1,500 a month. Bulk needs top-ups or a bigger plan (Open questions).
- Platform-wide SKUs mean a customer's catalogue can collide with someone else's; they learn it before uploading, but can't use the SKU.
- More moving parts: two worker pools, a webhook dispatcher, retention sweeps.
- Fixing the scene list, publishing and the rate limiter helps every user, not just bulk ones.

## Rollback

- Phase E0's fixes stand on their own; each reverts alone. Paging is the only API change, and the dashboard and `ModelMultiSelect` move with it.
- The `bulk_upload` flag hides `/bulk` and refuses `/ingest`; batches in flight finish or can be canceled for refunds.
- Ingest tables are new; dropping them loses batch history, not scenes, which are ordinary scenes once created.
- API keys can be revoked one by one or all at once; turning the dispatcher off queues deliveries until it is back.

## Plan

Continues ADR 0005's phases. E0 has no dependency and can start now, in parallel with ADR 0005's Phase A; E1 needs ADR 0005's A1 and A2 (job kinds, holds, worker protocol); E2 needs A3 and A4.

### Phase E0: what doesn't scale (backend and dashboard; any time, each in parallel)

**E0.1 Paged scene lists.** `GET /scenes` with `q`, `category`, `page`, `limit`; `DashboardShell`/`DashboardClient` and `ModelMultiSelect` move with it. Files: `backend/app/features/scene/service.py`, `backend/app/routers/scenes.py`, `backend/app/schemas/scene.py`, `src/lib/api/scenes.ts`, `src/lib/api/server-fetch.ts`, `src/components/dashboard/*`, `src/lib/dashboard/filters.ts`, `src/features/variants/ui/ModelMultiSelect.tsx`. Acceptance: a list of 1,000 scenes answers one page in one query and no storage call. Tests: pytest for filters and pages; Vitest for the dashboard's parameter handling.

**E0.2 Published state.** `scenes.published_at`, URLs without storage calls, publishing only on change, the backfill script. Acceptance: `PATCH` of a name copies nothing; a SKU added publishes once. Tests: pytest with a fake storage counting calls.

**E0.3 A shared rate limiter.** The Postgres counter behind `rate_limit_dependency`; the Next proxies stop double-limiting signed-in routes. Acceptance: two API processes share one budget. Tests: pytest against two sessions; the existing `test_rate_limit.py` ported.

**E0.4 SKUs and deletes.** `assert_sku_available` in upload and `PATCH`; deleting a scene deletes its files and releases its bytes. Acceptance: `PATCH` to a taken SKU is 409; storage bytes go back down after a delete. Tests: pytest.

### Phase E: bulk ingest and conversion

**E1. Ingest backend** (after A2 and E0.4): the two tables and the `render_jobs.ingest_item_id` column; create (validation, SKU checks, quote), `sku-check`, upload URLs with signed sizes, `uploaded`, submit with model-credit holds, cancel, item retry; the `convert` kind and its spec; `create_scene_from_glb` shared with uploads; `complete` for conversions. Files: `backend/app/features/ingest/*`, `backend/app/routers/ingest.py`, `backend/app/models/ingest.py`, `backend/app/schemas/ingest.py`, `backend/app/features/upload/service.py`, a migration. Acceptance: a batch with a taken SKU is 422 before anything is held; an upload of another size fails its check; a conversion's completion creates a scene that looks like an uploaded one; a failed conversion refunds its model credit. Tests: pytest per endpoint and per state change.

**E2. Convert mode and the CPU pool** (after A3 and A4, in parallel with E1, against a fixture payload): `buildParsedUpload` moved to `src/lib/upload/`; the convert mode (all formats, GLB included; auto decimation; units; roles; thumbnail as a warning); hermetic WASM through the worker's cache; GLB compression in Node behind `INGEST_COMPRESS_GLB` (and confirmation of whether the browser's compression fails today); the CPU profile claiming `convert`. Acceptance: `samples/PDR-2413.3dm` (local only; it isn't in git) converts to a GLB that the golden harness draws the same as today's fixture, and a small committed STEP or OBJ fixture does the same in CI; an STL in centimetres with `units: "cm"` comes out the right size; a design over the cap is decimated, one whose stones alone are over it fails with `over_polygon_cap`; no request leaves for jsDelivr or gstatic. Tests: Vitest for `conversion.json` (roles, units); a golden for a converted fixture.

**E3. The bulk upload page** (after E1; can start on a mocked API): `/bulk/new` (files, folders, ZIPs, the CSV, the checks table, the price, the upload queue with resume) and the first version of `/bulk/<id>` (upload and conversion stages). Files: `src/features/bulk/*`, `src/app/bulk/*`, Next routes under `src/app/api/ingest/`. Acceptance: 500 files and a CSV map, check and upload with the tab open, resuming after a reload; problems show before upload. Tests: Vitest for CSV parsing and matching, SKU rules, ZIP expansion; a Playwright test of the page against the mocked API.

### Phase F: render plans, results and the manifest

**F1. Look templates by role** (after E1): `role` on model config slots (from `conversion.json`, else from `kind`), template validation, `from-scene`, applying it when a scene is created; the picker on `/bulk/new`. Acceptance: a 3DM with a "Pave" layer gets the gem material; a template from a two-tone scene keeps both metals by role. Tests: pytest for derivation and application.

**F2. Render plans** (after E1 and ADR 0005's B3, in parallel with F1): plan validation, caps and price; render-credit holds at submit; fan-out on conversion; item and batch status; the thumbnail from the front still; `publish_media`; retries and cancel down to the jobs. Acceptance: a 3-design batch ends `completed` with 3 × (4 stills + 1 turntable) outputs and charges exactly its quote; a design whose turntable fails twice and then succeeds is `done`; canceling mid-way refunds everything not finished. Tests: pytest with a fake worker driving jobs through complete and fail.

**F3. Results** (after F2): the manifest (formula-safe), the `batch_archive` job and its parts, downloads on `/bulk/<id>`, the retention sweep for raw CAD and archives. Acceptance: the manifest's links open (public with `publish_media`, signed-in otherwise); the ZIP parts hold every output; files past `expires_at` are deleted. Tests: pytest for the CSV; a worker test that zips fixture outputs.

### Phase G: the customer API

**G1. Keys** (after F2): `api_keys`, `api_principal`, per-key limits, the keys section of the profile page. Acceptance: a revoked key is refused at once; a key without `batches:write` can't create a batch; a session can't call `/v1`. Tests: pytest.

**G2. `/v1`** (after G1): the endpoints, cursors, error codes, required idempotency, the OpenAPI document and a docs page. Acceptance: a script with only an API key uploads 10 files, submits, polls and downloads the manifest. Tests: pytest per endpoint; the script as a smoke test.

**G3. Webhooks** (after G2; the dispatcher can start in parallel): the two tables, the dispatcher service, signing, retries, the address checks, the endpoint list and delivery log in the UI. Acceptance: a completed batch delivers one signed `batch.completed` that a reference verifier accepts; an endpoint on a private address is refused; a failing endpoint is retried on schedule and turned off after 3 days. Tests: pytest with a local receiver.

## Open questions

Work can start on these defaults.

| Question | Default |
|---|---|
| Largest batch | Studio 500 designs and 20 GB, Grow 100 and 5 GB; no bulk on Free; 3 unfinished batches per user |
| Largest file | 100 MB, as the direct upload today (STEP files of complex pieces may need 250 MB) |
| Paying for bulk | 1 model credit and the plan's render credits per design (7 for the default plan). Add top-ups: 100 model credits and 1,000 render credits, priced by the owner |
| Public media links in the manifest | Off by default, as decided for F2: outputs stay private until a plan sets `publish_media`, which publishes them for designs with a SKU |
| SKUs across the platform | Keep them platform-wide; conflicts are reported before upload. Per-account embed paths are a separate decision |
| Retention | Raw CAD 30 days after the batch finishes; archives 14 days; manifests and scenes until deleted |
| API access | Studio only at first |
| Units of unitless files | Keep the size guess, let the CSV override it, and show each design's size in millimetres on the batch page so a 2 mm "ring" stands out |
| Decimation | Automatic, metal only, to the plan's cap; fail a design whose stones alone exceed it |
| Named look templates | Not in v1; the batch stores its template. Add a table if API customers need template ids. As built in F1: a table of each owner's templates, one a scene, which batches pick by id and keep a checked copy of |
| Webhook retries | 24 hours of retries per delivery; turn an endpoint off after 3 days of failures |
