# Feature ownership map

| Feature / area | Path | Owns |
|----------------|------|------|
| Upload & slot review | `src/features/upload` | File pick, presign/register flow, slot review UI |
| Viewer (3D studio) | `src/features/viewer` | Canvas, model, sidebar, shell, embed |
| Scene persistence | `src/features/scene` | Scene API client, types re-exports |
| Capture / export bridges | `src/features/render` | Screenshot, video, hires, transparent capture bridges |
| Design system | `src/components/ui` | Buttons, dialogs, primitives |
| Backend upload | `backend/app/features/upload` | Register/multipart ingest orchestration |
| Backend scene | `backend/app/features/scene` | Scene queries and patches |
| Backend render | `backend/app/features/render` | Render save and listing |
| Backend files | `backend/app/features/file_access` | Static file streaming |
| Core | `backend/app/core` | Storage, model key helpers |
| Feature toggles | `src/features/feature-flags`, `backend/app/features/feature_flags` | Admin on/off switches, public flag snapshot, route gating |
| Admin console | `src/features/admin`, `backend/app/features/admin` | Users, credits, webhooks, support ops |

Update this file when adding a new feature app.
