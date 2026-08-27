# Task 7 report — Five-tab ViewerShell is the default Edit path

Branch: `cursor/paper-stage-workstation-f2a1`

## What changed

Saved scenes now open the five-tab paper `ViewerShell` (`/viewer/:id`) instead of `/model/:id`.

| File | Change |
|---|---|
| `src/components/dashboard/scene-display.ts` | `viewerHref` builds `/viewer/${viewerIdFromModelKey(scene.model_key)}` |
| `src/app/viewer/[id]/page.tsx` | Removed `redirect(\`/model/${initialScene.id}\`)`. Always renders `ViewerShell` with `initialScene` |
| `src/features/upload/hooks/useUploadModelFlow.ts` | After save, navigates to `/viewer/${viewerIdFromModelKey(result.modelKey)}` |
| `src/features/viewer/ui/ViewerShell.tsx` | Embed "Open full studio" uses the viewer path when `initialScene.model_key` is present. Embed chrome stays 48px + zoom only |
| `src/lib/__tests__/default-edit-path.test.ts` | Asserts `viewerHref` is `/viewer/` (never `/model/`) and viewer page source has no `/model/` redirect |

## How to open the default Edit path

Dashboard Edit / scene open, post-upload save, and embed "Open full studio" all go to `/viewer/<viewerId>` (viewer id derived from the scene `model_key`). `/model/[id]` remains for power users but is not the default.

## Kept

- WebGPU, five tabs, catalogs, Quality, paper stage
- Embed = 48px + zoom only (no shopper dock)
- `ModelEditorShell` / `/model/[id]` not deleted
- www/admin/live hosts untouched
