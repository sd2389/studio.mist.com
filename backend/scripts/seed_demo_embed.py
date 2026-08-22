"""CLI: seed one published demo piece for /embed shopper Metal + Gem.

Idempotent. Re-running updates the same SKU and reprints the embed id.

Usage (after docker compose up):
    docker compose exec backend python -m scripts.seed_demo_embed

Local backend venv:
    cd backend && python -m scripts.seed_demo_embed
"""

from __future__ import annotations

from app.database import SessionLocal
from app.features.demo_embed.service import seed_demo_embed


def main() -> None:
    with SessionLocal() as db:
        result = seed_demo_embed(db)
    action = "created" if result.created else "updated"
    print(f"[seed] demo embed {action}")
    print(f"[seed] embed_id : {result.embed_id}")
    print(f"[seed] sku      : {result.sku}")
    print(f"[seed] model    : {result.model_key}")
    print()
    print(f"Open /embed/{result.embed_id} on the web host after compose is up.")


if __name__ == "__main__":
    main()
