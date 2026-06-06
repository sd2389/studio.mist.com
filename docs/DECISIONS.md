# Architecture decisions (archive)

Historical decision log from early development. For current architecture see [ARCHITECTURE.md](./ARCHITECTURE.md).

Key choices still in effect:

- **Client-side CAD** — `.3dm` / `.stl` parsed in-browser; GLB is canonical storage
- **Postgres-only** — no SQLite; Alembic owns schema
- **Docker compose** — postgres + backend + web as default run path
- **Owned catalog** — DB-backed parametric materials; no competitor asset files
- **DevJewels Studio** — product name (not Gemora)

Full append-only log preserved from vault migration (2026-05-13 entries cover video encode, offscreen render, HDRIs, finish textures, rebrand, etc.).
