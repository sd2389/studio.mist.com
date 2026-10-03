# Third-party assets and libraries

What the app ships or fetches that it did not make, the licence each comes under, and where it is used. Licences were checked on 2026-10-02 against the package metadata in `node_modules` or the backend virtualenv, or against the upstream source for anything not installed. Add a row when you bundle or fetch something new.

## Bundled assets

| Asset | Origin | Licence | Used by |
|---|---|---|---|
| `public/hdr/photo_studio_01_2k.hdr` | [Photo Studio 01](https://polyhaven.com/a/photo_studio_01) by Sergej Majboroda, Poly Haven | CC0 | `studio` lighting (`src/lib/viewer-lighting.ts`), the designer's light theme, the home film |
| `public/hdr/studio_small_09_2k.hdr` | [Studio Small 09](https://polyhaven.com/a/studio_small_09) by Sergej Majboroda, Poly Haven | CC0 | `soft` lighting |
| `public/hdr/dancing_hall_2k.hdr` | [Dancing Hall](https://polyhaven.com/a/dancing_hall) by Sergej Majboroda, Poly Haven | CC0 | `dark` lighting |
| `public/hdr/brown_photostudio_02_2k.hdr` | [Brown Photostudio 02](https://polyhaven.com/a/brown_photostudio_02) by Sergej Majboroda, Poly Haven | CC0 | `catalog` lighting |
| `public/hdr/studio_small_08_2k.hdr` | [Studio Small 08](https://polyhaven.com/a/studio_small_08) by Sergej Majboroda, Poly Haven | CC0 | `dramatic` lighting, the designer's dark theme, the home film |
| DM Sans, Fraunces, Geist Mono | Google Fonts, downloaded at build time by `next/font/google` and served with the app | SIL Open Font License 1.1 | Type across the site and app (`src/app/layout.tsx`) |

The five HDRs are Poly Haven's 2k `.hdr` files; their MD5s match Poly Haven's file listing.

## Fetched at runtime

| Asset | Fetched from | Licence | Used by |
|---|---|---|---|
| Catalogue HDRIs: the 92 in `backend/app/features/catalog/seed/polyhaven_hdris.json` (72 metal, 20 gem) | `api.polyhaven.com` (1k `.hdr`) and `cdn.polyhaven.com` (preview), copied into storage by `backend/scripts/fetch_cc0_hdris.py` | CC0, like every Poly Haven asset; all 92 ids are Poly Haven HDRIs | Catalogue environments in the studio |
| rhino3dm 8.17.0 (JS and WASM) | `cdn.jsdelivr.net/npm/rhino3dm@8.17.0/` | MIT (Robert McNeel & Associates) | 3DM import: `src/lib/convert/loaders/rhino.ts`, `src/lib/slot-materials/detect-upload-slots.ts` |
| occt-import-js 0.0.23 (JS and WASM, a build of Open CASCADE Technology) | `cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/`; not in `package.json` | LGPL-2.1: the `license` in its `package.json`; its `LICENSE.md`, `dist/license.occt-import-js.txt` and `dist/license.occt.txt` are the LGPL 2.1 text. Loaded unmodified into a worker, never bundled | STEP and IGES import: `src/lib/convert/loaders/occt-worker.ts` |
| Draco decoder 1.5.5 | `www.gstatic.com/draco/versioned/decoders/1.5.5/` | Apache-2.0 ([google/draco](https://github.com/google/draco)) | Draco-compressed glTF: `src/lib/convert/loaders/gltf.ts` and drei's `useGLTF` default |

## Libraries

Frontend, licence from each package's `package.json`:

| Library | Licence | Used for |
|---|---|---|
| three.js | MIT | All 3D: rendering, loaders, exporters; the meshopt decoder it ships is MIT too |
| React Three Fiber, drei | MIT | The React layer over three.js in the studio, designer and home film |
| Mediabunny | MPL-2.0, used unmodified | MP4 muxing of turntable videos (`src/lib/video-capture.ts`) |
| fflate | MIT | ZIPs (Campaign Pack, ring-size pack, PNG frame sequences) and 3MF import |
| glTF-Transform | MIT | GLB compression after CAD import (`src/lib/convert/compress-glb.client.ts`) |
| draco3dgltf | Apache-2.0 | The Draco encoder for that compression |
| meshoptimizer | MIT | Meshopt compression and mesh simplification on upload |
| rhino3dm (npm) | MIT | Declared in `package.json`; the browser loads the jsDelivr build above |
| Next.js, React | MIT | The web app |
| sharp | Apache-2.0; its prebuilt libvips binaries are LGPL-3.0-or-later | `next/image` optimisation on the server (an optional dependency of Next.js) |
| Lucide | ISC | Icons |
| Sentry JavaScript SDK | MIT | Error reporting |

Backend, licence from the installed package metadata:

| Library | Licence | Used for |
|---|---|---|
| rhino3dm (Python) | MIT | Reading 3DM uploads (`backend/app/services/model_config.py`) |
| psycopg2-binary | LGPL with exceptions | PostgreSQL driver |
| Pillow | MIT-CMU | Catalogue swatches and image processing |
| FastAPI, SQLAlchemy, Alembic | MIT | API, ORM, migrations |
| boto3 | Apache-2.0 | R2 and S3 storage |
| Stripe, sentry-sdk | MIT | Billing, error reporting |
