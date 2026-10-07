"""CLI: the bulk upload retention sweep (app/features/ingest/retention.py, ADR 0006 F3).

Deletes every batch's raw CAD files 30 days after the batch finished, and its archive's ZIP parts
14 days after they were made, giving the parts' bytes back to their owner's storage. A scene's
own files are never touched. Safe to run again, and alongside another run: each batch is claimed
once. Run it daily, e.g. from cron or a scheduled container:

    0 3 * * * docker compose exec -T backend python -m scripts.sweep_ingest_retention

Usage (inside the backend container, or from backend/ with its venv):
    python -m scripts.sweep_ingest_retention
"""

from __future__ import annotations

import sys

from app.database import SessionLocal
from app.features.ingest.retention import sweep_expired


def main() -> int:
    with SessionLocal() as db:
        result = sweep_expired(db)
    print(f"[retention] raw CAD files deleted : {result.source_files} of {result.sources_batches} batch(es)")
    print(f"[retention] archives deleted      : {result.archives} ({result.archive_bytes} bytes given back)")
    print(f"[retention] could not delete      : {result.failures} file(s), left for the next run")
    return 1 if result.failures else 0


if __name__ == "__main__":
    sys.exit(main())
