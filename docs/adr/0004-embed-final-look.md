# ADR 0004: The embed shows the finished piece, view only

## Status

Accepted

## Context

The embed (`/embed/<SKU>`) puts a piece on a store's product page. It carried a metal and stone switcher for shoppers, and it looked up the saved environments, backdrop and ground in catalogue pages the API serves only to signed-in users. A shopper's embed therefore lost the catalogue look and any catalogue or library materials (a missing environment slug was even fetched as a file), while the jeweler, previewing it signed in, saw it right. The owner's decision: the embed shows the piece exactly as it was finished in the studio, final look and view only.

## Decision

- The embed is view only. Shoppers turn it, zoom and go fullscreen; there is no material switcher. The display options (header, title, auto-rotate, zoom controls, studio link, branding) stay.
- Every scene detail carries `look` (`backend/app/features/scene/look.py`): the active catalogue environments, background, ground, metals and gems that the saved settings and slot selections name, and the owner's own library materials they name, never another user's. The viewer registers those materials and resolves the look against them (`src/features/viewer/domain/saved-look.ts`), so the embed needs no catalogue access.
- The studio and the embed draw the piece with one `ViewerStage`. The surface finish is saved with the look (`scene_settings.finish`).
- Embed links name the piece and nothing else. Viewer options are read from the saved scene; query parameters (`?chrome=0`, `?branding=…`) still override them for one page.

## Publishing

There is no separate publish step. A scene with a SKU is published: its upload and every save copy the GLB and thumbnail to the public bucket (`publish_scene_to_public`), and the studio saves each change about 350 ms after it is made. The embed page reads the scene from the API on every load, uncached, so a later save shows up in every pasted snippet on its next load. A scene without a SKU has no embed link, and its model stays private.

## Consequences

- A scene detail runs a few more small queries, one per kind of look item.
- The public scene reads (`/scenes/by-sku/…`, `/scenes/by-model/…`) also return the catalogue items and library material parameters the look uses, which a viewer needs to draw it.
- The studio now resolves saved catalogue items beyond the Edit tab's first page, and gradient backdrops show behind the piece in both views (they were hidden under the stage's paper).
- Uploaded backdrop images are private files, so they still show in neither view.
- Published GLBs sit at a fixed path per SKU with a one-year immutable cache: a SKU reused for a different model can keep serving the old file until caches expire.

## Rollback

Restore `EmbedShopperMaterials` and its hooks from git history and mount it under the embed's stage. The `look` field is additive: views that ignore it fall back to the Edit tab's catalogue pages, as before.
