"""CLI: generate catalog swatch thumbnails and persist to storage.

Usage (from backend/):
    .studiovenv/bin/python -m scripts.generate_catalog_swatches
    .studiovenv/bin/python -m scripts.generate_catalog_swatches --force
    .studiovenv/bin/python -m scripts.generate_catalog_swatches --limit 10
"""

import argparse

from app.database import SessionLocal
from app.features.catalog.swatch_service import generate_all


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate catalog swatch thumbnails")
    parser.add_argument("--force", action="store_true", help="Regenerate even if swatch_key exists")
    parser.add_argument("--limit", type=int, default=None, help="Max rows per entity type")
    args = parser.parse_args()

    with SessionLocal() as db:
        stats = generate_all(db, force=args.force, limit=args.limit)

    print("Swatch generation complete:")
    print(f"  generated: {stats['generated']}")
    print(f"  skipped:   {stats['skipped']}")
    print(f"  failed:    {stats['failed']}")


if __name__ == "__main__":
    main()
