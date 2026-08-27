# Tasks 4 + 5 — Paper-stage restyle report

## Status

DONE

## Files changed

- `src/app/globals.css` — `--paper: #F4F2EE` on `.studio-stage`; `bg-paper`; `bg-studio-canvas` is warm paper + fiber (not ice-blue). `:root --card/#eaeff5` left for marketing.
- `src/features/viewer/ui/ViewerShell.tsx` — flush 280px sidebar from `md`, 52px top bar, mobile catalog sheet + 5-tab bar; embed paper + zoom only.
- `src/features/viewer/ui/StudioTopBar.tsx` — 52px, paper, hairline, quiet Save/Share, real `QualityMenu`.
- `src/features/viewer/ui/StudioSidebar.tsx` — controlled `panel` (uncontrolled fallback for gallery/stones), no atelier wordmark, square Now Showing.
- `src/features/viewer/ui/StudioPrimaryBar.tsx` — Metal rings / Gem diamond / Light sun / Export share-box / More ellipsis; active = black rounded rect.
- `src/features/viewer/ui/StudioCatalogSheet.tsx` — new; ≤50vh paper sheet + drag handle.
- `src/features/viewer/ui/useStudioPrimaryPanel.ts` — shared panel state hook.
- `src/features/viewer/ui/EmbedChrome.tsx` — 48px (`h-12`) paper hairline; no shopper.
- `src/features/viewer/ui/ZoomControls.tsx` — quiet paper buttons; embed = vertical +/− only.
- `src/features/viewer/ui/QualityMenu.tsx` — presentation only; still reads `useViewerQualityStore`; `Auto (High)` after mount.
- Picker header classes only: `material-kind-picker.tsx`, `LightPickerPanel.tsx`, `ExportSharePanel.tsx`, `MoreSceneControls.tsx`, `MoreMaterialsControls.tsx`, `MoreCatalogGrid.tsx`.
- `src/features/viewer/index.ts` — exports for `StudioPrimaryBar`, `StudioCatalogSheet`.
- `src/lib/__tests__/studio-primary-ia.test.ts` — chrome/IA assertions.

## Layout breakpoints

- **1280 / md+ (768px):** `aside.w-[280px]` flush left, full height; canvas column with `h-[52px]` top bar. Sidebar visible from `md`, not only `lg`.
- **320 / &lt;md:** 52px top bar (back, piece name, Quality); viewer; catalog sheet `max-h-[50vh]` above a five-tab `StudioPrimaryBar`. No Controls FAB.
- **Embed:** 48px chrome (`h-12` / `top-12`); zoom only; no `StudioPrimaryBar` / Metal|Gem shopper dock.

## Confirmations

- WebGPU path untouched (`src/lib/gpu/**`, `ViewerCanvas`, `JewelryModel`, `ViewerPostFX` not edited).
- Five tabs kept: Metal, Gem, Light, Export, More.
- `QualityMenu` still bound to `useViewerQualityStore` (Auto/High/Balanced/Performance).
- Embed has no shopper dock and does not render `StudioPrimaryBar`.
- Model editor (`src/features/editor/**`) and dashboard/landing/admin shells not restyled.
- Export orb, fake `Quality / High` overlay, ice `#eaeff5` studio chrome, italic atelier wordmark removed from studio chrome.

## Test command + result

```
npx vitest run src/lib/__tests__/studio-primary-ia.test.ts src/lib/__tests__/export-parity.test.ts src/lib/__tests__/viewer-quality.test.ts src/lib/__tests__/embed-settings.test.ts
```

Result: **4 files, 28 tests passed.**
