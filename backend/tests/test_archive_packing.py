"""How many parts a batch archive needs (docs/adr/0006-bulk-pipeline.md, "Results"): the API counts
them as the worker packs them, so a batch whose files fit 100 parts is never refused. The cases in
fixtures/archive_packing.json are checked here against the API's count and in
scripts/render-worker/archive.test.mjs against the worker's ZIPs."""

import json
from pathlib import Path

import pytest
from archive_samples import finished_batch  # noqa: F401 - fixtures
from ingest_samples import client, cloud, owner  # noqa: F401 - fixtures
from render_samples import api_session, batch_outputs, gpu  # noqa: F401 - fixtures

from app.features.billing.plans import GB
from app.features.render_jobs.archive_spec import MAX_PARTS, PART_BYTES, parts_needed
from app.models import RenderJob

CASES = json.loads((Path(__file__).parent / "fixtures" / "archive_packing.json").read_text())


@pytest.mark.parametrize("case", CASES["cases"], ids=[case["name"] for case in CASES["cases"]])
def test_the_api_counts_the_parts_the_worker_packs(case):
    files = [(name, size) for name, size in case["files"]]

    assert parts_needed(CASES["manifest_name"], case["manifest_bytes"], files, case["part_bytes"]) == case["parts"]


def test_fifty_outputs_of_about_2_gb_take_a_part_each_within_the_jobs_parts():
    files = [(f"R-{number}/video/turntable.mp4", 2 * GB - 4096) for number in range(1, 51)]

    # The manifest alone in the first part, as the first video can't join it; each video alone.
    assert parts_needed("manifest.csv", 8 * 1024 * 51, files, PART_BYTES) == 51 <= MAX_PARTS


def test_a_smaller_file_than_its_cap_never_takes_more_parts():
    capped = [("R-1/thumbnail.webp", 2 * 1024 * 1024), ("R-1/stills/front.jpg", 2 * GB - 3 * 1024 * 1024)] * 20
    actual = [("R-1/thumbnail.webp", 40_000), ("R-1/stills/front.jpg", 2 * GB - 3 * 1024 * 1024)] * 20

    assert parts_needed("manifest.csv", 9000, actual) <= parts_needed("manifest.csv", 9000, capped)


def test_a_batch_of_large_outputs_that_fits_a_hundred_parts_is_archived(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=10)
    outputs = batch_outputs(db, batch["id"])
    for output in outputs:
        output.bytes = 2 * GB - 4096  # as stored, about 2 GB a file: 100 GB in all
    db.commit()
    assert len(outputs) == 50

    res = client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers)

    assert res.status_code == 201, res.text
    max_parts = db.get(RenderJob, res.json()["job"]["id"]).spec["max_parts"]
    # Each file alone, the thumbnails (at their 2 MB cap) between them, the first with the manifest.
    assert max_parts == 1 + 50 + 9
