# Task 7 — Edit / post-upload / studio-open links audit

Branch: `cursor/paper-stage-workstation-f2a1`  
Scope: every jeweler **Edit**, **post-upload save**, and **studio-open** navigation that pointed at `/model/` instead of `/viewer/` (paper `ViewerShell`).

Search method: `git grep '/model/'` on `main` and current branch across `*.ts` / `*.tsx`, excluding static assets (`/models/…`), API routes (`/api/models/…`), middleware route matchers, and auth path prefixes.

---

## Summary

| # | File | Role | Status on branch |
|---|------|------|------------------|
| 1 | `src/components/dashboard/scene-display.ts` | Dashboard Edit href builder (`viewerHref`) | **Fixed** (commit `35668a6`) |
| 2 | `src/components/dashboard/DashboardScenesPanel.tsx` | Dashboard Edit links (via `viewerHref`) | **Fixed** (inherits #1) |
| 3 | `src/app/viewer/[id]/page.tsx` | Saved-scene redirect away from ViewerShell | **Fixed** (commit `35668a6`) |
| 4 | `src/features/upload/hooks/useUploadModelFlow.ts` | Post-upload `router.push` | **Fixed** (commit `35668a6`) |
| 5 | `src/features/viewer/ui/ViewerShell.tsx` | Embed “Open full studio” (`editorHref`) | **Fixed** (commit `35668a6`) |

**No other source hits** on `main` or this branch route jeweler Edit / studio-open flows to `/model/`.  
`/model/[id]` (`ModelEditorShell`) remains reachable directly for power users; it is not linked from the default Edit path.

---

## 1. `viewerHref` — dashboard Edit href builder

**File:** `src/components/dashboard/scene-display.ts`

**Was (main):**

```ts
export function viewerHref(scene: Scene) {
  return `/model/${scene.id}`;
}
```

**Should be / now is (branch):**

```4:6:src/components/dashboard/scene-display.ts
export function viewerHref(scene: Scene) {
  return `/viewer/${encodeURIComponent(viewerIdFromModelKey(scene.model_key))}`;
}
```

Uses viewer id from `scene.model_key` so `fetchSceneByViewerIdServer` can hydrate the scene on `/viewer/:id`.

---

## 2. Dashboard Edit hrefs — consumers of `viewerHref`

**File:** `src/components/dashboard/DashboardScenesPanel.tsx`

Two **Edit** entry points delegate to `viewerHref(scene)`; no inline `/model/` strings. Changing #1 fixes both.

**Dropdown “Edit” (lines 271–277):**

```271:277:src/components/dashboard/DashboardScenesPanel.tsx
                        <DropdownMenuItem className="p-0">
                          <Link
                            href={viewerHref(scene)}
                            className="flex w-full min-h-10 items-center px-3 py-2 text-sm focus-visible:outline-none"
                          >
                            Edit
                          </Link>
```

**Primary “Edit” button (lines 307–316):**

```307:316:src/components/dashboard/DashboardScenesPanel.tsx
                  <div className="flex gap-2">
                    <Link
                      href={viewerHref(scene)}
                      className={cn(
                        buttonVariants({ size: "default" }),
                        "h-10 min-h-11 flex-1 rounded-xl shadow-sm transition-shadow hover:shadow-md",
                      )}
                    >
                      Edit
                    </Link>
```

**Was:** both resolved to `/model/${scene.id}` via old `viewerHref`.  
**Now:** both resolve to `/viewer/<viewerId>`.

---

## 3. Viewer page redirect — saved scenes bypassing ViewerShell

**File:** `src/app/viewer/[id]/page.tsx`

**Was (main):**

```ts
import { redirect } from "next/navigation";
// ...
if (initialScene?.id) {
  redirect(`/model/${initialScene.id}`);
}
return <ViewerShell modelId={id} variant="studio" initialScene={initialScene} />;
```

**Should be / now is (branch):** no redirect; always render ViewerShell.

```17:21:src/app/viewer/[id]/page.tsx
export default async function ViewerPage({ params }: ViewerPageProps) {
  const { id } = await params;
  const initialScene = await fetchSceneByViewerIdServer(id).catch(() => null);

  return <ViewerShell modelId={id} variant="studio" initialScene={initialScene} />;
}
```

This was the main reason saved uploads at `/viewer/:id` never showed the five-tab paper chrome.

---

## 4. Post-upload navigation — upload save → studio open

**File:** `src/features/upload/hooks/useUploadModelFlow.ts`

**Was (main, ~line 240):**

```ts
setSaveMessage("Opening editor…");
router.push(`/model/${result.sceneId}`);
```

**Should be / now is (branch):**

```238:241:src/features/upload/hooks/useUploadModelFlow.ts
      setSaveProgress(100);
      setSaveMessage("Opening studio…");
      logClientEvent("upload.save.done", { sceneId: result.sceneId, sku: trimmedSku });
      router.push(`/viewer/${encodeURIComponent(viewerIdFromModelKey(result.modelKey))}`);
```

Requires `viewerIdFromModelKey` import from `@/lib/model-key` (added on branch). Uses `result.modelKey`, not numeric `sceneId`.

---

## 5. Embed “Open full studio” — `editorHref` in ViewerShell embed branch

**File:** `src/features/viewer/ui/ViewerShell.tsx`

**Was (main, ~line 248):**

```tsx
editorHref={
  initialScene?.id ? `/model/${initialScene.id}` : undefined
}
```

**Should be / now is (branch):**

```247:251:src/features/viewer/ui/ViewerShell.tsx
            editorHref={
              initialScene?.model_key
                ? `/viewer/${encodeURIComponent(viewerIdFromModelKey(initialScene.model_key))}`
                : undefined
            }
```

**Related (already correct, no change needed):** `src/features/viewer/ui/EmbedChrome.tsx` defaults `studioHref` to `/viewer/${modelId}` when `editorHref` is omitted:

```26:26:src/features/viewer/ui/EmbedChrome.tsx
  const studioHref = editorHref ?? `/viewer/${encodeURIComponent(modelId)}`;
```

---

## Guard test (branch)

**File:** `src/lib/__tests__/default-edit-path.test.ts`

Asserts `viewerHref` never contains `/model/` and `viewer/[id]/page.tsx` source has no `redirect(\`/model/` — locks the four primary fixes above.

---

## Explicitly out of scope (not Edit-path hits)

| Path / file | Why excluded |
|-------------|--------------|
| `src/app/model/[id]/page.tsx` | Power-user route; `ModelEditorShell` stays — not a default Edit link source |
| `src/middleware.ts` `"/model/:path*"` | Auth matcher, not navigation |
| `src/lib/auth/constants.ts` `"/model"` | Protected prefix list, not href |
| `/upload-model`, `/models/clearcoat/…` | Upload landing & static demo assets, not saved-scene Edit |
| `EditorEmbedTab` preview | Opens `/embed/…`, not `/model/` |

---

## Verification commands

```bash
# Should return only test assertions + middleware/auth (no navigation hrefs):
git grep -n '/model/' -- '*.tsx' '*.ts' \
  | grep -v __tests__ | grep -v sample-models | grep -v '/models/' \
  | grep -v middleware | grep -v auth/constants | grep -v model-url | grep -v api/models

# Dashboard Edit resolves via viewerHref:
git grep -n 'viewerHref' src/components/dashboard/
```

On this branch, the first command returns **zero** navigation hits; all five audit items above are addressed in commit `35668a6`.
