# Architecture

Feature-driven layout: **one feature owns its UI, domain logic, and API adapters**. Shared UI primitives stay under `components/ui`. Shared cross-cutting helpers stay under `src/lib` until they belong to a single feature.

## Layers

| Layer | Responsibility |
|-------|----------------|
| **Route / page** | Compose features; no business rules |
| **Feature UI** | Present state; call feature hooks/API |
| **Feature domain** | Rules, transforms, types (pure where possible) |
| **Feature API adapter** | HTTP calls to backend / Next routes |
| **Core / lib** | Storage, env, geometry—used by many features |

## Rules (KISS + SRP)

1. **One function, one job** — parse, validate, transform, persist, and render are separate steps.
2. **KISS** — add abstractions only after the same pattern appears 2–3 times.
3. **Plain names** — prefer `saveSceneToServer` over `persistCtx`.
4. **No domain logic in** `app/api/*` route handlers beyond auth/validation glue.
5. **Feature public API** — import from `@/features/<name>` (barrel `index.ts`), not deep paths into another feature's internals.

## Layout

- `src/features/*` — product features (upload, viewer, scene, render, …)
- `src/components/ui/*` — design system
- `src/lib/*` — shared technical utilities
- `backend/app/features/*` — backend feature services
- `backend/app/core/*` — shared backend infrastructure
- `backend/app/routers/*` — thin HTTP adapters

## Shared building blocks

Reuse these instead of rebuilding them per page:

| Need | Use |
|------|-----|
| A metal or gem picker tile | `MaterialSwatch` (`src/components/ui/material-swatch.tsx`); icons in `swatch-icons.tsx` |
| A material's swatch colour or fineness stamp | `presetSwatchHex`, `metalBadge` (`src/lib/material-colors.ts`) |
| A studio page (sidebar, phone sheet, header, export dialogs) | `StudioLayout` (`@/features/viewer`) |
| A lit 3D view of jewelry or a stone (full view or catalogue tile) | `StudioCanvas` (`@/features/viewer`) |
| A saved scene drawn as it was finished (the studio view, the embed and the render harness) | `ViewerStage`, fed by `applySavedLook` (the look into the studio store, with its catalogue and library materials) and `useLookStage` (the store as stage props) (`@/features/viewer`); the scene's `look` brings its catalogue items ([ADR 0004](adr/0004-embed-final-look.md)) |
| Everything a lighting mode sets | `LIGHTING_PRESETS` (`src/lib/viewer-lighting.ts`) |
| Still export settings and rendering | `StillExportSettings`, `exportStill` (`@/features/render`) |
| Turntable recording options | `turntableCaptureOptions`, `videoSizeLabel` (`@/features/render`) |
| A video's camera, frame by frame (an orbit from a view, a cut through poses) | `turntablePath`, `multiAnglePath` (`src/lib/video-camera-path.ts`): the studio's video export and the render harness both move their camera with them |
| A turntable job: an orbit from the live view or a cut through poses, at the size, rate, length and quality picked | `turntableJobSpec` with `orbitPath` or `posesPath`, then `turntableJobRequest` (`@/features/render`); the Videos tab's modes in `videoJobRequests` (`src/features/editor/lib/video-job-requests.ts`) |
| A batch's scenes and variants as server jobs (the "Multiple" modes) | `useBatchTargets` (`src/features/editor/hooks/useBatchExport.ts`), then `batchRenderTargets` (`src/lib/variants/batch-export.ts`): the current scene in the studio's look, the rest as saved |
| A video resolution or frame-rate picker | `VideoResolutionField`, `VideoFpsField` (`@/features/render`); with `isServerExport` they lock what the plan's server videos can't be (Free: no 8K, nothing above 30 fps) and offer no rate above 60 |
| What the plan lets an export be (size cap, watermark, Campaign Pack, a server video's frame rate and length) | `loadExportPlan`, `useExportPlan`, `ExportPlanNote`, `maxVideoSeconds` (`@/features/render`), from the billing snapshot's features (`max_video_fps`, `max_video_seconds`, `max_8k_video_seconds` for videos); offscreen sessions take `ExportLimits` (`src/lib/export-limits.ts`), refuse larger sizes and draw the watermark (`src/lib/export-watermark.ts`) on every frame |
| An export rendered on the server: start it, price it first, follow it, cancel, retry or download it | `RenderJobButton` (a server export's Render button: the price beside it, then each job it started with its progress, and its files downloaded once ready), built on `createRenderJob` / `createRenderJobs`, `useRenderJobQuote` / `quoteRenderJobs` with `RenderJobCost`, `useStartedRenderJobs` and `useRenderJob`; `ExportJobsPanel` (a scene's jobs, or all of them on `/exports`, with Retry) (`@/features/render`), behind the `server_exports` flag ([ADR 0005](adr/0005-server-exports.md)) |
| Whether exports render on the server | `useServerExports` (`@/features/render`): the `server_exports` flag in the browser, null until read |
| What a job renders: the saved scene and look, the camera, the spec | `ExportSceneProvider` / `useExportScene` (the studio's scene and its current look, from `ViewerShell`), `liveViewCamera`, `stillJobSpec`, `quickStillSpec`, `stillJobRequest` (`@/features/render`) |
| A Campaign Pack job: the dialog's config as a spec, then the request | `campaignPackJobSpec` (no ASET image without traced gems, the live view when it isn't auto-framed), `campaignPackJobRequest` (named after the pack's root folder) (`src/features/render/lib/render-job-requests.ts`) |
| A Campaign Pack rendered from a loaded stage, wherever its files go | `renderPackOnStage` (`src/features/render/campaign-pack/engine/stage-pack.ts`) with a `PackFileWriter` and a turntable encoder: the studio's pack into a ZIP in memory (`engine/start-pack.ts`), the render harness's to the worker's sink (`harness/render-pack.ts`) |
| A stage on `frameloop="never"` that must keep drawing while something waits on its frames | `tickFixedClock` (`@/features/viewer`), on the fixed clock the warm-up draws on |
| A list of jobs that shows the ones this page just created | `onRenderJobsCreated` (`src/features/render/lib/render-jobs-api.ts`), which `useRenderJobList` already listens to |
| The look an export renders | `lookSnapshot` (`@/features/viewer`), the same look the studio autosaves |
| A scene's thumbnail from the live view ("Set as thumbnail") | `setThumbnailFromView` (`@/features/render`): a capture of at most 1024 px, free and unmarked, to `PUT /scenes/{id}/thumbnail` |
| An upgrade prompt for a locked option or feature | `UpgradePrompt`, `UpgradeButton` (`src/components/billing/UpgradePrompt.tsx`) |
| How many of a credit balance were bought, which renewals keep ("Includes 5 bought credits, kept at renewal.") | `BoughtCreditsNote` (`src/components/billing/BoughtCreditsNote.tsx`), fed by the billing snapshot's `bought_balances`; `boughtCreditsLeft` (`src/lib/billing/format.ts`) after spends since the snapshot |
| A drop area for files, and folders with their paths | `FileDropZone` (`src/components/ui/file-drop-zone.tsx`; the upload page's and the bulk upload's), on `DroppedFile` and the folder walking in `src/lib/upload/dropped-files.ts` |
| Polling something until it settles (1 s, then half as long again, up to 5 s) | `pollUntil`, `pollDelay` (`src/lib/polling.ts`): `pollRenderJob` and the bulk batch page both poll with it |
| Bulk upload batches: the client and its proxies | `src/lib/api/ingest.ts` (types from `backend/app/schemas/ingest.py`; `batchProblems` reads a 422's problems), `relayIngest` (`src/lib/api/ingest-relay.ts`) for the routes under `src/app/api/ingest/`; `relayUpstreamJson` passes an API's `problems` on |
| Many CAD files at once: grouping, ZIPs, the CSV manifest, checks, uploads straight to storage | `src/features/bulk/` (`/bulk/new`, `/bulk/<id>`), behind the `bulk_pipeline` flag ([ADR 0006](adr/0006-bulk-pipeline.md)) |
| An option pill, or a labelled row of them; an option the plan locks | `Chip`, `ChipField` (`locked`) (`src/components/ui/chip.tsx`); `PlanLock`, the lock a locked option shows (`src/components/ui/plan-lock.tsx`) |
| A price for a design | `quoteDesign` (`src/lib/pricing/quote.ts`) |
| An embed link, iframe snippet or copy button | `useEmbedCode`, `useCopyFeedback`, `EmbedKeyNotice` (`src/components/embed/embed-code.tsx`) |
| A marketing page in the house look (header, footer, film grain, viewfinder corners) | `SiteShell`, with `PageIntro`, `Stat`, `Kicker`, `Reveal` and the class recipes in `site-styles.ts` (`src/components/site/`) |
| Light or dark look, site-wide | Tokens in `globals.css` (`--mist-*`; `.dark` on `<html>`, set before paint by `FILM_THEME_SCRIPT`), `ThemeToggle` (`src/components/site/`), `useFilmTheme` / `setFilmTheme` (`src/components/scroll-film/film-theme.ts`); 3D previews pick their set with `siteLighting` (`src/lib/viewer-lighting.ts`) |
| A scroll-driven film page (chapters, eased scroll, kinetic type, preloader) | `src/components/scroll-film/` — `useStoryDriver`, `story`, `Chapter`, `Line`, `Readout`, `FilmChrome`, `useFilmTheme`, `scroll-film.css`; used by the home page (`src/components/home/`) |

## Decisions

Record non-obvious structure changes in `docs/adr/` (see template).

Operational quality: [`QUALITY-GATES.md`](QUALITY-GATES.md). Onboarding for new features: [`ENGINEERING-PLAYBOOK.md`](ENGINEERING-PLAYBOOK.md).
