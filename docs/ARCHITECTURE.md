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
| A saved scene drawn as it was finished (the studio view and the embed) | `ViewerStage`, fed by `savedLook` and `registerLookMaterials` (`src/features/viewer/`); the scene's `look` brings its catalogue items ([ADR 0004](adr/0004-embed-final-look.md)) |
| The credit a bundled third-party model's licence asks for | `modelCreditFor` (`src/features/viewer/domain/model-credit.ts`); `ViewerStage` shows it |
| Everything a lighting mode sets | `LIGHTING_PRESETS` (`src/lib/viewer-lighting.ts`) |
| Still export settings and rendering | `StillExportSettings`, `exportStill` (`@/features/render`) |
| Turntable recording options | `turntableCaptureOptions`, `videoSizeLabel` (`@/features/render`) |
| A video resolution picker | `VideoResolutionField` (`@/features/render`) |
| What the plan lets an export be (size cap, watermark, Campaign Pack) | `loadExportPlan`, `useExportPlan`, `ExportPlanNote` (`@/features/render`); offscreen sessions take `ExportLimits` (`src/lib/export-limits.ts`), refuse larger sizes and draw the watermark (`src/lib/export-watermark.ts`) on every frame |
| An upgrade prompt for a locked option or feature | `UpgradePrompt`, `UpgradeButton` (`src/components/billing/UpgradePrompt.tsx`) |
| An option pill | `Chip` (`src/components/ui/chip.tsx`) |
| A price for a design | `quoteDesign` (`src/lib/pricing/quote.ts`) |
| An embed link, iframe snippet or copy button | `useEmbedCode`, `useCopyFeedback`, `EmbedKeyNotice` (`src/components/embed/embed-code.tsx`) |
| A marketing page in the house look (header, footer, film grain, viewfinder corners) | `SiteShell`, with `PageIntro`, `Stat`, `Kicker`, `Reveal` and the class recipes in `site-styles.ts` (`src/components/site/`) |
| Light or dark look, site-wide | Tokens in `globals.css` (`--mist-*`; `.dark` on `<html>`, set before paint by `FILM_THEME_SCRIPT`), `ThemeToggle` (`src/components/site/`), `useFilmTheme` / `setFilmTheme` (`src/components/scroll-film/film-theme.ts`); 3D previews pick their set with `siteLighting` (`src/lib/viewer-lighting.ts`) |
| A scroll-driven film page (chapters, eased scroll, kinetic type, preloader) | `src/components/scroll-film/` — `useStoryDriver`, `story`, `Chapter`, `Line`, `Readout`, `FilmChrome`, `useFilmTheme`, `scroll-film.css`; used by the home page (`src/components/home/`) |

## Decisions

Record non-obvious structure changes in `docs/adr/` (see template).

Operational quality: [`QUALITY-GATES.md`](QUALITY-GATES.md). Onboarding for new features: [`ENGINEERING-PLAYBOOK.md`](ENGINEERING-PLAYBOOK.md).
