# Render worker

The worker renders server exports ([ADR 0005](../../docs/adr/0005-server-exports.md)). It claims render jobs from the API, renders each in the render harness's export mode (`/render-harness?mode=export`, only in the `BUILD_TARGET=worker` build of the app) in headless Chrome on the host's GPU, uploads the files and completes the job. The page never sees a token: the worker's Node process makes every API call and hands the page its job and a loopback sink.

| Module | Does |
|---|---|
| `worker.mjs` | Entry point: slots, claims, browser recycling, shutdown |
| `config.mjs` | The settings below, from the environment |
| `api.mjs` | The API: claim, payload, inputs, heartbeat, uploads, complete, fail, with retries |
| `browser.mjs` | Launch profiles and the self-check |
| `job.mjs` | One job, from payload to complete or fail |
| `sink.mjs` | The loopback server the page writes files, frames and progress to |
| `network.mjs` | What a page may reach |
| `assets.mjs` | The disk cache of catalogue files and decoders |
| `harness.mjs` | Starts the worker build's server on 127.0.0.1 (in the container) |
| `smoke.mjs` | `npm run worker:smoke` |

It renders stills and angle sets. Turntables and spins come with B3, which adds ffmpeg and ZIP output to the sink's frames and files.

## Run a worker

### With Docker Compose

The worker image is `Dockerfile.worker`, for linux/amd64 (Chrome for Testing has no arm64 Linux build). Plain `docker compose up` starts no worker; each worker service has its own profile.

1. Give the backend and the workers one token: set `RENDER_WORKER_TOKEN` in `.env`, or copy `docker-compose.override.example.yml` to `docker-compose.override.yml`.
2. Start a worker:
   - CPU, any machine: `docker compose --profile worker-cpu up -d --build`. WebGPU on SwiftShader: slow, but the backend production draws with.
   - NVIDIA GPU: `docker compose --profile worker-gpu up -d --build`, on a host with the NVIDIA driver (535 or later) and the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/). The service reserves one GPU and asks for the driver's `graphics` capability, which mounts the Vulkan driver WebGPU runs on.
3. `docker compose logs -f worker-cpu` (or `worker-gpu`) shows the adapter the self-check found, then each job.
4. Queue a still: in the studio, with the `server_exports` flag on in the admin console, or with `docker compose exec backend python -m scripts.seed_smoke_job`.

The worker container runs as `node` with a read-only root file system, its jobs in a tmpfs at `/tmp` and the asset cache in a volume. Chrome's sandbox stays on; under Docker's default seccomp profile its user namespace needs `cap_add: SYS_ADMIN`, which the compose services set. In Compose, catalogue files are served by the API, under `http://localhost:8765/files/` as the browser sees it; `WORKER_ASSET_ORIGINS` maps that to `http://backend:8765/files/` for the worker.

### On the host

For development, on a Mac's GPU or on SwiftShader. You need Playwright's Chromium (`npx playwright install chromium`).

```bash
BUILD_TARGET=worker npm run build
BUILD_TARGET=worker npx next start -p 3900 -H 127.0.0.1
RENDER_API_URL=http://localhost:8765 RENDER_WORKER_TOKEN=<the backend's> \
  HARNESS_BASE_URL=http://127.0.0.1:3900 WORKER_GPU=metal npm run worker:render
```

The harness must be on loopback: WebGPU and WebCodecs exist only in a secure context, which plain HTTP is only on loopback.

### Smoke test

`npm run worker:smoke` runs one still end to end on this machine and stops everything it starts. It needs a worker build (`BUILD_TARGET=worker npm run build`, in `.next` or `NEXT_BUILD_DIR`), Playwright's Chromium and the backend's virtualenv (`backend/.venv`, or `WORKER_SMOKE_PYTHON`).

1. An API on a free port from 8790, with a throwaway SQLite database and local storage, seeded by `backend/scripts/seed_worker_smoke.py`: a Free user with credits and a scene of the demo ring. The worker build of the app on a free port from 3900, unless `HARNESS_BASE_URL` names one.
2. The user creates a still over HTTP; a worker on the `swiftshader` profile (`WORKER_GPU=metal` for a Mac's GPU) claims, renders, uploads and completes it; the user downloads it.
3. The download must be what the browser pipeline renders from the same job, Free mark included: the harness's export mode is run directly, with and without the mark, and compared.
4. A page under the worker's network policy must reach its harness and not an outside host, the API on loopback or the cloud metadata address.

`npm run worker:smoke -- --kill` kills the worker and its browser mid-job instead, and checks a second worker completes the job as its second attempt once the lease (60 s there) has lapsed. `WORKER_SMOKE_KEEP=1` keeps the scratch folder with every process's log.

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
| `WORKER_KINDS` | `still,angle_set` | The kinds it claims |
| `WORKER_ID` | the host name | Each slot claims as `<id>-<slot>` |
| `WORKER_POLL_SECONDS` | `5` | How often an idle slot asks for a job |
| `WORKER_RECYCLE_JOBS` | `50` | Jobs a browser renders before it is replaced |
| `WORKER_ASSET_ORIGINS` | | Comma-separated URL prefixes the page may load catalogue files from, through the cache; `<prefix>=<from>` fetches them from elsewhere |
| `WORKER_CACHE_DIR` | `<tmp>/render-worker-cache` | The asset cache |
| `WORKER_CACHE_MAX_MB` | `2048` | Its size; the least recently used files go first |
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

## What a page may reach

Each job gets a fresh browser context, with service workers blocked. Its page may reach:

- the harness origin, except the API's job routes there: `/render-jobs/<this job>/inputs/<name>` (the look's background on local storage) is fetched by the worker, with the job's token, and handed to the page;
- its own sink;
- the job's signed inputs (a background image on cloud storage), fetched by the worker;
- `WORKER_ASSET_ORIGINS` and Draco's decoder (`https://www.gstatic.com/draco/`), from the asset cache.

Everything else is aborted, other loopback ports and the cloud metadata address included, and logged without its query string. The browser gets the worker's environment without anything that looks like a credential.
