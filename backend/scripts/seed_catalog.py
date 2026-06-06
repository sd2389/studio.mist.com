"""CLI: seed the clean-room catalog. Idempotent.

Usage (from backend/):
    .studiovenv/bin/python -m scripts.seed_catalog
"""

from app.database import SessionLocal
from app.features.catalog.seed.runner import seed_all


def main() -> None:
    with SessionLocal() as db:
        counts = seed_all(db)
    total = sum(counts.values())
    print("Catalog seeded:")
    for name, count in counts.items():
        print(f"  {name}: {count}")
    print(f"  total: {total}")


if __name__ == "__main__":
    main()
