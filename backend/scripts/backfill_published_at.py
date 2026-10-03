"""CLI: run once after migration 220347ac191f (scenes.published_at).

The migration marks every scene with a SKU as published, as every save published it until
then. This checks each of those scenes against storage, once: one whose public copies exist
stays published; one whose copies are missing is published again, and stays unpublished
(private URLs) if that fails too. Safe to run again.

Usage (inside the backend container):
    python -m scripts.backfill_published_at

Local backend venv:
    cd backend && python -m scripts.backfill_published_at
"""

from __future__ import annotations

from app.database import SessionLocal
from app.features.publish.service import check_published_scenes


def main() -> None:
    with SessionLocal() as db:
        counts = check_published_scenes(db)
    print(f"[published_at] copies found      : {counts['published']}")
    print(f"[published_at] published again   : {counts['republished']}")
    print(f"[published_at] could not publish : {counts['failed']}")


if __name__ == "__main__":
    main()
