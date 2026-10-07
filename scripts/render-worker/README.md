# Render worker

The worker renders server exports ([ADR 0005](../../docs/adr/0005-server-exports.md)). It claims render jobs from the API, renders each in the render harness's export mode (`/render-harness?mode=export`, only in the `BUILD_TARGET=worker` build of the app) in headless Chrome on the host's GPU, uploads the files and completes the job. With `convert` in `WORKER_KINDS` it also converts bulk uploads' designs into GLBs, in the harness's convert mode ([ADR 0006](../../docs/adr/0006-bulk-pipeline.md); see [Conversions](#conversions)), and with `batch_archive` it zips a finished batch's files into its archive (see [Batch archives](#batch-archives)). The page never sees a token: the worker's Node process makes every API call and hands the page its job and a loopback sink.

| Module | Does |
|---|---|
| `worker.mjs` | Entry point: slots, claims, browser recycling, shutdown |
| `config.mjs` | The settings below, from the environment |
| `api.mjs` | The API: claim, payload, inputs, heartbeat, uploads, complete, fail, with retries |
| `browser.mjs` | Launch profiles and the self-check |
| `job.mjs` | One job, from payload to complete or fail |
| `convert.mjs` | What a convert job does differently: its files in, its checks on what the page made |
| `archive.mjs` | A batch archive: a finished batch's files into ZIP parts, no page |
| `vendor.mjs` | The converters' files, pinned by hash; `node vendor.mjs <dir>` fetches them |
| `failure.mjs` | The codes a job fails with, and which another attempt may fix |
| `sink.mjs` | The loopback server the page writes files, frames, videos and progress to |
| `outputs.mjs` | What each kind's page hands the sink, and the outputs the worker makes of it |
| `encode.mjs` | ffmpeg: a turntable's raw frames into an MP4 |
| `zip.mjs` | Files from disk into one ZIP, streamed through fflate, as a list or one at a time |
| `progress.mjs` | A job's progress and stage, for its heartbeats |
| `network.mjs` | What a page may reach |
| `assets.mjs` | The disk cache of catalogue files and decoders |
| `harness.mjs` | Starts the worker build's server on 127.0.0.1 (in the container) |
| `smoke.mjs`, `smoke-outputs.mjs` | `npm run worker:smoke` |
| `smoke-convert.mjs` | `npm run worker:smoke-convert` |
| `smoke-stack.mjs` | What the smokes start and stop: the API, the worker app, workers |
| `fake-ffmpeg.mjs` | A stand-in ffmpeg for the tests |

It renders every kind the export mode does: stills and angle sets, whose images the page encodes; turntables, whose raw frames go through ffmpeg into an MP4; spins, whose frames and viewer page go into one ZIP; and Campaign Packs, whose files and turntables (through ffmpeg) go into one ZIP (see [Encoders](#encoders)).

## Run a worker

### With Docker Compose

The worker image is `Dockerfile.worker`, for linux/amd64 (Chrome for Testing has no arm64 Linux build). Plain `docker compose up` starts no worker; each worker service has its own profile.

1. Give the backend and the workers one token: set `RENDER_WORKER_TOKEN` in `.env`, or copy `docker-compose.override.example.yml` to `docker-compose.override.yml`.
2. Start a worker:
   - CPU, any machine: `docker compose --profile worker-cpu up -d --build`. WebGPU on SwiftShader: slow, but the backend production draws with.
   - NVIDIA GPU: `docker compose --profile worker-gpu up -d --build`, on a host with the NVIDIA driver (535 or later) and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/). The service reserves one GPU and asks for the driver's `graphics` capability, which mounts the Vulkan driver WebGPU runs on.
   - Bulk uploads' conversions and archives: `docker compose --profile worker-convert up -d --build`, the CPU pool. It runs the `swiftshader` profile and claims `convert` and `batch_archive` alone, so the GPU workers keep to renders.
3. `docker compose logs -f worker-cpu` (or `worker-gpu`, `worker-convert`) shows the adapter the self-check found, then each job.
4. Queue a still: in the studio, with the `server_exports` flag on in the admin console, or with `docker compose exec backend python -m scripts.seed_smoke_job`.

The worker container runs as `node` with a read-only root file system, its jobs in a tmpfs at `/tmp` and the asset cache in a volume. Chrome's sandbox stays on; under Docker's default seccomp profile its user namespace needs `cap_add: SYS_ADMIN`, which the compose services set. In Compose, catalogue files are served by the API, under `http://localhost:8765/files/` as the browser sees it; `WORKER_ASSET_ORIGINS` maps that to `http://backend:8765/files/` for the worker.

### On the host

For development, on a Mac's GPU or on SwiftShader. You need Playwright's Chromium (`npx playwright install chromium`) and, for turntables, ffmpeg with libx264 (Homebrew's `ffmpeg` has it).

```bash
BUILD_TARGET=worker npm run build
BUILD_TARGET=worker npx next start -p 3900 -H 127.0.0.1
RENDER_API_URL=http://localhost:8765 RENDER_WORKER_TOKEN=<the backend's> \
  HARNESS_BASE_URL=http://127.0.0.1:3900 WORKER_GPU=metal npm run worker:render
```

The harness must be on loopback: WebGPU and WebCodecs exist only in a secure context, which plain HTTP is only on loopback.

To convert too, fetch the converters' files once (`node scripts/render-worker/vendor.mjs <dir>`, about 11 MB from jsDelivr and gstatic, each checked against its pinned hash) and add `WORKER_KINDS=convert WORKER_VENDOR_DIR=<dir>`.

### Smoke test

`npm run worker:smoke` runs a still, a turntable, a spin and a small Campaign Pack end to end on this machine and stops everything it starts. It needs a worker build (`BUILD_TARGET=worker npm run build`, in `.next` or `NEXT_BUILD_DIR`), Playwright's Chromium, ffmpeg with libx264 and ffprobe, and the backend's virtualenv (`backend/.venv`, or `WORKER_SMOKE_PYTHON`).

1. An API on a free port from 8790, with a throwaway SQLite database and local storage, seeded by `backend/scripts/seed_worker_smoke.py`: a Free user with credits and a scene of the demo ring, and a Grow user with another. The worker build of the app on a free port from 3900, unless `HARNESS_BASE_URL` names one.
2. The Free user creates a 640×480 still, a one-second turntable at that size starting from the still's camera, and a 12-frame spin over HTTP, and the Grow user a Campaign Pack of the ring as configured and in 18K yellow gold (front JPG and cutout, a 12-frame spin and a one-second square turntable each); a worker on the `swiftshader` profile (`WORKER_GPU=metal` for a Mac's GPU) claims, renders, encodes, uploads and completes each; the users download them.
3. The still must be what the browser pipeline renders from the same job, Free mark included: the harness's export mode is run directly, with and without the mark, and compared.
4. The MP4 must be H.264 High, yuv420p, BT.709 and limited range with every frame (ffprobe), its index ahead of the media, and play to its end in Chrome, whose frame 0 must match the still (SSIM ≥ 0.97).
5. The spin's ZIP must open and hold its frames and `spin.html`, which in Chrome loads every frame and turns, by itself and with the arrow keys.
6. The pack's ZIP must hold the entries the studio's planner names, in its order; its MP4s must be what the turntable's is (4); its manifest must list every other entry at its size; its `spin.html` must turn; and its re-skinned gold must be the studio's own: its front cutout against the harness's still of the ring with its metal slot in 18K yellow gold, from the same camera, at most 3 apart (of 255) on the piece. They are 0.65 apart on a Mac's GPU; with the stage left still while the metal environment probe waits, 22.
7. A page under the worker's network policy must reach its harness and not an outside host, the API on loopback or the cloud metadata address.

`npm run worker:smoke -- --kill` runs the still alone, kills the worker and its browser mid-job, and checks a second worker completes the job as its second attempt once the lease (60 s there) has lapsed. `WORKER_SMOKE_KEEP=1` keeps the scratch folder with every process's log and the outputs (under `uploads/`).

`npm run worker:smoke-convert` converts a bulk upload end to end the same way. It needs the same, but ffmpeg, and fetches the converters' files into `WORKER_VENDOR_DIR` (default: the OS's temp folder, kept between runs) unless they are there with their hashes.

1. The API, seeded by `backend/scripts/seed_convert_smoke.py` with a Studio user, and the worker app, as above.
2. The user creates a batch over HTTP of the fixtures in `tests/convert/` (a STEP, a 3DM, an OBJ with its MTL, an STL in centimetres given `units: "cm"`) and the demo ring's GLB, with three more that mustn't convert as they are: the OBJ again under a cap of 300 triangles, which its metal must be decimated to fit; under 40, which its stone (46) alone passes; and the OBJ's bytes named `.3dm`. Local storage can't sign uploads (the API answers 503), so the seed script puts each file where its signed PUT would have; the user confirms the uploads and submits the batch, and the seed script lowers the two jobs' caps (the fixtures are far below any plan's).
3. A worker on the `swiftshader` profile with `WORKER_KINDS=convert` converts every design.
4. Each of the five must be a scene with its SKU, `Metal 1` and `Gem 1` in the metal and gem roles, a 512 px WebP thumbnail and a GLB compressed with meshopt and Draco; the design's polygon count and its length in millimetres must be the fixture's (24.5 mm for the ring, the STL in centimetres included; the demo GLB's 1.8 mm, as the upload page sizes it too); the capped one must fit 300 and say it was decimated. The other two must have failed with `over_polygon_cap` and `model_unreadable`, their model credits given back, and the batch must be `completed_with_errors`.
5. The worker must have loaded every vendored file, and logged nothing blocked and nothing fetched: no page reached a CDN.
6. The upload page, run in the same browser on the STEP, the 3DM, the OBJ and the GLB (its sign-in and storage calls answered by the smoke), must store the very GLB the worker made of each, byte for byte: a 3DM's but for the random ids three.js gives the materials the Rhino loader makes, which the model's root carries in its extras.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `RENDER_API_URL` | required | The API |
| `RENDER_WORKER_TOKEN` | required | One of the API's `RENDER_WORKER_TOKEN` tokens; given a comma-separated list (as Compose passes the API's), the worker sends the first |
| `WORKER_GPU` | `metal` on macOS, else `nvidia` | The launch profile: `nvidia`, `metal` or `swiftshader` |
| `WORKER_REQUIRE_GPU` | | `1` refuses the `swiftshader` profile (production) |
| `HARNESS_BASE_URL` | | A running worker build, on loopback |
| `WORKER_APP_DIR` | `/app` in the image | A standalone worker build to start on `127.0.0.1:WORKER_HARNESS_PORT` when `HARNESS_BASE_URL` is unset |
| `WORKER_HARNESS_PORT` | `3000` | |
| `WORKER_SLOTS` | `1` | Jobs at once, a browser each: one per GPU, two on 24 GB cards; give each 8 GB of RAM |
| `WORKER_KINDS` | `still,angle_set,turntable,spin,campaign_pack` | The kinds it claims, any of those and `convert` and `batch_archive`, which only a worker told to claims (the CPU pool) |
| `WORKER_FFMPEG` | `ffmpeg` | The ffmpeg turntables encode with, a Campaign Pack's too; it needs libx264. A worker that claims turntables or packs checks it before it claims anything |
| `WORKER_ID` | the host name | Each slot claims as `<id>-<slot>` |
| `WORKER_POLL_SECONDS` | `5` | How often an idle slot asks for a job |
| `WORKER_RECYCLE_JOBS` | `50` | Jobs a browser renders before it is replaced |
| `WORKER_ASSET_ORIGINS` | | Comma-separated URL prefixes the page may load catalogue files from, through the cache; `<prefix>=<from>` fetches them from elsewhere |
| `WORKER_CACHE_DIR` | `<tmp>/render-worker-cache` | The asset cache |
| `WORKER_CACHE_MAX_MB` | `2048` | Its size; the least recently used files go first |
| `WORKER_VENDOR_DIR` | `/app/vendor` in the image, else `<WORKER_CACHE_DIR>/vendor` | The converters' vendored files (`vendor.mjs`). A worker that converts claims nothing until all of them are there with their hashes |
| `WORKER_TMP_DIR` | the OS's | Where each job's folder goes |
| `WORKER_CHROMIUM_SANDBOX` | `1` | `0` turns Chrome's sandbox off, for a host that can't give it a user namespace. Don't, for customers' jobs |

## Profiles and the self-check

Every profile is Chrome for Testing in new headless mode (Playwright's `channel: "chromium"`), the only headless mode that gets a GPU adapter.

| Profile | Where | Flags | The probe must find |
|---|---|---|---|
| `nvidia` | Linux GPU hosts | `--enable-unsafe-webgpu --use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE --disable-vulkan-surface --ignore-gpu-blocklist` | WebGPU on an adapter whose vendor is `nvidia` |
| `metal` | a Mac | none | WebGPU on vendor `apple` |
| `swiftshader` | CI, CPU-only hosts | `--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader --use-angle=swiftshader --enable-features=Vulkan --use-vulkan=swiftshader` | WebGPU on architecture `swiftshader` |

All add `--force-color-profile=srgb --hide-scrollbars`. Before a slot claims anything, and after every browser restart, it opens the harness's `?mode=probe` (which reports the backend three.js picked and the adapter) and runs a WebGPU submit. If either isn't what the profile promises, the worker claims nothing and exits with an error, so a host with broken drivers stays idle rather than rendering slowly or differently. A job drawn by another backend fails as `gpu_lost` and replaces the browser. Every completed job records its browser, backend and adapter.

## Encoders

**Turntables.** ffmpeg starts before the page opens, one per clip. The page posts each frame raw (RGBA, `POST /frames/<n>`, in order); the sink writes it straight to ffmpeg's stdin and answers the page only once ffmpeg's pipe has all of it, so the page draws the next frame only then and at most one frame is in the worker. Once the last frame is in, ffmpeg finishes the MP4:

```
ffmpeg -f rawvideo -pix_fmt rgba -s <w>x<h> -r <fps> -i pipe:0
  -vf scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv
  -c:v libx264 -preset <preset> -crf <crf> -profile:v high
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -color_range tv
  -movflags +faststart -an out.mp4
```

| `quality` | CRF | Preset |
|---|---|---|
| `standard` | 23 | `medium` |
| `high` | 20 | `medium` |
| `max` | 17 | `slow` |

H.264 High in yuv420p, converted with the BT.709 matrix to limited range and tagged so in the frames and the stream (without that ffmpeg converts with BT.601, leaves the tags empty, and metals shift colour), with the index ahead of the media (`+faststart`). The API makes width and height even. The MP4 must hold every frame (ffmpeg's last progress report says how many it encoded) and stay under the API's 4 GB.

**Frames in parts.** The network allowlist intercepts every request the page makes, the sink's too, and Chrome hands each intercepted request's body to the worker over DevTools, as text. So the page sends each frame as Blobs of at most 16 MB (`POST /frames/<n>?offset=<first byte>&length=<the frame's bytes>`): a whole 8K frame (133 MB) makes a message larger than Node can read, which crashes the worker, and an ArrayBuffer body is also copied into DevTools' request events, where a Blob isn't. The copy that is left costs about 10 ms a MB. On an M-series Mac (`metal`), a 120-frame 1080p turntable took 15 s from claim to complete (45 s with whole ArrayBuffer frames) and a 30-frame 8K one 66 s; at that rate the longest videos the plans allow, a minute of 4K or 20 s of 8K at 60 fps, would run past the 30-minute limit. Keeping the sink's requests out of the interception would remove the cost.

**Spins.** The page posts each frame (`frame_001.jpg`, …, numbered as the Campaign Pack numbers them) and then `spin.html` as files, which the sink takes under those names only. Once the page is done, the worker streams them from disk into one ZIP with fflate's `Zip`: frames stored, `spin.html` deflated, a chunk at a time, each file deleted once it is in. fflate writes no ZIP64, so the ZIP stops at the API's cap, 4 GB less a byte.

**Campaign Packs.** The page renders the pack with the studio's own pack (its planner, names, metal re-skins, cameras and documents) and hands each file over as it is made, under its path in the pack's ZIP (`Smoke-ring/stills/18k-yellow-gold_front.jpg`): the sink takes paths for a pack, every part a file name the API would give and none `.` or `..`, stores each as `entry-<n>` and takes no more files than the spec can make. Each turntable is a video of its own: `POST /videos/<path>` with `{width, height, fps, frames}` opens it, its frames come by `POST /frames/<n>` as a turntable job's do, and `POST /videos/<path>/end`, once all are in, has ffmpeg finish the MP4 and answers its size, which the page's manifest lists. A video must be one the spec makes (a format's size, the spec's rate and length, no more than its metals × formats), gets an ffmpeg of its own at the `high` quality's CRF and preset, and goes one at a time. Once the page is done, the files and MP4s go into one ZIP in the order the page made them, which must be the order the sink stored them in (the page reports its entries): media stored, text deflated, each deleted once it is in. That order is the studio's pack's, so the ZIP holds what the studio's would, by the same names (the default pack: 251 entries with a SKU, 252 with the ASET image). The ZIP is reported as the API plans it, `application/zip` with no width, height or label.

**Progress.** A heartbeat carries `stage` and `progress`: `loading` (0), then `rendering` as the page reports its frames, `encoding` once the page is done and ffmpeg finishes or the ZIP is written, and `uploading` (0.95). A turntable's frames rendered and frames encoded (from ffmpeg's `-progress`) fill the bar together, 0.475 each; a spin's frames fill 0.9 and its ZIP 0.05; stills and angle sets fill 0.95 with their images. A Campaign Pack's page reports its own measure of the whole pack (stills, spins and turntables, each MP4 finished before the next part), at most once a second, which fills 0.9, and its ZIP 0.05.

**Failures.** ffmpeg failing (it won't start, dies or encodes fewer frames than it got) fails the job as `encode_failed`, which the API tries again; an MP4 or ZIP over its cap is `over_limit`, which it doesn't. A pack's files are counted against the ZIP's cap as they come in (what fflate adds to each entry included, to the byte), so a pack that passes it stops as `over_limit` before it renders more. Past the kind's run time (turntable 30 min, spin 15, Campaign Pack 60) the job fails as `timeout` and ffmpeg is killed.

## What a page may reach

Each job gets a fresh browser context, with service workers blocked. Its page may reach:

- the harness origin, except the API's job routes there: `/render-jobs/<this job>/inputs/<name>` (the look's background on local storage) is fetched by the worker, with the job's token, and handed to the page;
- its own sink;
- the job's signed inputs (a background image on cloud storage), fetched by the worker;
- `WORKER_ASSET_ORIGINS` and Draco's decoder (`https://www.gstatic.com/draco/`), from the asset cache;
- the converters' vendored files (`vendor.mjs`), from `WORKER_VENDOR_DIR`, never fetched.

A convert job's page may reach no asset origin at all: only the harness, its sink and the vendored files. Everything else is aborted, other loopback ports and the cloud metadata address included, and logged without its query string. The browser gets the worker's environment without anything that looks like a credential.

## Conversions

A bulk upload's designs ([ADR 0006](../../docs/adr/0006-bulk-pipeline.md), "Conversion jobs") are converted by workers that claim `convert`: the CPU pool, `worker-convert` in Compose (the `swiftshader` profile, `WORKER_KINDS=convert`). A conversion needs no GPU beyond its 512 px thumbnail, so GPU workers never claim one unless told to.

1. The worker downloads the design's source and companions (an OBJ's MTL and textures, a glTF's `.bin`) with the job's token, from the API's job routes on local storage or their signed GETs, each exactly the bytes it was uploaded with, else `input_missing`. The source must start as its format's files do (`glTF`, `ISO-10303-21`, the Rhino and FBX headers, a ZIP for 3MF, …) before any parser sees it, else `model_unreadable`.
2. The sink serves them to the page at `/inputs/source` and `/inputs/companions/<n>`. The page, `/render-harness?mode=convert`, gets the spec and limits and nothing else: no storage location, no token.
3. The page runs the upload page's Save on them, the same functions the upload page calls (`src/lib/upload/`): parse and split metal from stones, settle the unit (`units` for a file that declares none), decimate metal to `max_polygons` (or fail `over_polygon_cap` when the stones alone keep it over, or `decimate` is `"fail"`), list the layers, export the GLB with the upload page's compression (meshopt and Draco) and render the thumbnail (a warning if it fails). It posts `model.glb`, `thumbnail.webp` and `conversion.json` (`ConversionReport` in `backend/app/features/ingest/conversions.py`: the model config, selections, polygon count, units, each slot's role and warnings).
4. The worker checks what the page made before anything goes up: a GLB 2.0 whose chunks fit and whose JSON has meshes, a WebP of the thumbnail's size, a report of the API's fields within the cap. It uploads them as `convert_spec.py` plans them (the thumbnail 512 × 512, the others with no size) and completes the job; the API checks the model again and makes the scene.

## Batch archives

A finished batch's archive ([ADR 0006](../../docs/adr/0006-bulk-pipeline.md), "Results") is a `batch_archive` job, which the CPU pool claims beside conversions. It opens no page. The payload is the batch's manifest and, for every design in the order dropped, each output and thumbnail: its path in the archive (`<SKU>/stills/front.jpg`, `<SKU>/video/turntable.mp4`, `<SKU>/spin/spin.zip`, `<SKU>/thumbnail.webp`), a signed GET good for the job's run time (an API route with the job's token on local storage), and its stored size when the API has one.

1. The worker writes ZIP parts in order, the manifest first in the first part (deflated; media stored), each file fetched just before it goes in (exactly its stored size, else `input_missing`) and deleted once it is in. A file that would take a part past `part_bytes` (2 GB) starts the next one; a file larger than that goes alone. More parts than the spec's `max_parts` stop the job as `over_limit`.
2. Each part, `<stem>-part-<n>.zip`, is uploaded as soon as it is written, then deleted, so the job's folder holds about one part and one file at a time.
3. The worker completes the job with every part, its hash and how many files it holds, and no renderer. The parts are gone from disk, so a refused complete fails the job (`upload_failed`) for another attempt rather than uploading again.

The bar moves as the files go into parts and the parts go up.

The converters' WASM and glue, which the upload page loads from jsDelivr (rhino3dm 8.17.0, occt-import-js 0.0.23) and gstatic (Draco 1.5.5), are vendored rather than cached. `vendor.mjs` pins each file's SHA-256; the image fetches them when it is built and refuses any other bytes, and they sit in its read-only root, where no job can change what the next one's page runs, as a file in a writable cache could be. The page asking for one of those URLs gets the vendored file: a conversion depends on no CDN being up and makes no request to one. A worker that converts claims nothing until every file is there with its hash.
