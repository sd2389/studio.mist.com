"""CLI: download CC0 Poly Haven HDRIs for catalog environments.

Usage (from backend/):
    .studiovenv/bin/python -m scripts.fetch_cc0_hdris
    .studiovenv/bin/python -m scripts.fetch_cc0_hdris --force
    .studiovenv/bin/python -m scripts.fetch_cc0_hdris --limit 5
"""

import argparse

from app.database import SessionLocal
from app.features.catalog.environment_assets import sync_all


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch CC0 HDRIs from Poly Haven")
    parser.add_argument("--force", action="store_true", help="Re-download even if keys exist")
    parser.add_argument("--limit", type=int, default=None, help="Max environments to process")
    args = parser.parse_args()

    with SessionLocal() as db:
        stats = sync_all(db, force=args.force, limit=args.limit)

    print("HDRI sync complete:")
    print(f"  downloaded: {stats['downloaded']}")
    print(f"  skipped:    {stats['skipped']}")
    print(f"  failed:     {stats['failed']}")


if __name__ == "__main__":
    main()
