# Feature ownership map

| Feature / area | Path | Owns |
|----------------|------|------|
| Upload & slot review | `src/features/upload` | File pick, presign/register flow, slot review UI |
| Viewer (3D studio) | `src/features/viewer` | Canvas, model, sidebar, shell, embed; the one studio (`/viewer`) |
| Scene editing | `src/features/editor` | The studio's Edit tab (`SceneEditPanel`): details and variants, specs, full catalogues and user library, position, camera, layers, batch exports, embed settings. `/model/:id` redirects to `/viewer` |
| Scene persistence | `src/features/scene` | Scene API client, types re-exports |
| Capture / export bridges | `src/features/render` | Screenshot, video, hires, transparent capture bridges; export plan gates (size cap, Free watermark, Campaign Pack tiers) |
| Render worker | `scripts/render-worker`, `Dockerfile.worker` | Claims render jobs and renders them in the harness's export mode in headless Chrome on the host's GPU: launch profiles and self-check, sink, network policy, asset cache, uploads |
| Campaign pack | `src/features/render/campaign-pack` | One-click ZIP: stills per metal × angle, turntables, 360° spin + viewer, ASET image, embed |
| Studio scenes | `src/features/scene-setups` | Scene presets, reflective floors, props (plinth, crystals, silk), model-bounds staging |
| Ring designer | `src/features/ring-builder`, `src/app/design` | Parametric configurator UI, build worker, downloads, studio handoff |
| Jewelry CAD kernel | `src/lib/jewelry-cad`, `src/lib/stones` | Shanks, heads, settings, generated cuts, STL/OBJ/GLB export, specs |
| Pricing engine | `src/lib/pricing`, `src/features/ring-builder/ui/PriceCard.tsx` | Quotes from a design's specs: metal by weight, stones by carat, setting and bench labour, markup; jeweler rates |
| Gem rendering | `src/lib/gem-gpu` | Ray-traced gem shader, facet-plane atlas, jewelry light tents, gem presets |
| CAD import | `src/lib/convert` | Format loaders (GLB, STL, 3DM, OBJ, FBX, PLY, 3MF, STEP, IGES), units, metal/gem segmentation |
| Design system | `src/components/ui` | Buttons, dialogs, primitives |
| Backend upload | `backend/app/features/upload` | Register/multipart ingest orchestration; `create_scene_from_glb`, shared with bulk uploads |
| Backend bulk ingest | `backend/app/features/ingest` | Batches of CAD files: manifests, SKU checks, plan limits, signed uploads, credit holds, convert jobs and the scenes they make ([ADR 0006](adr/0006-bulk-pipeline.md)) |
| Backend scene | `backend/app/features/scene` | Scene queries and patches |
| Backend render | `backend/app/features/render` | Render save and listing |
| Backend files | `backend/app/features/file_access` | Static file streaming |
| Core | `backend/app/core` | Storage, model key helpers |
| Feature toggles | `src/features/feature-flags`, `backend/app/features/feature_flags` | Admin on/off switches, public flag snapshot, route gating |
| Admin console | `src/features/admin`, `backend/app/features/admin` | Users, credits, webhooks, support ops |

Update this file when adding a new feature app.
