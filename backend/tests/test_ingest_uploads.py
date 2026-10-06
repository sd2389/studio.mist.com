"""A batch's CAD files go straight to private storage through signed PUTs, each URL holding its
file's size and type (docs/adr/0006-bulk-pipeline.md, "Uploading in bulk"); confirming checks the
stored sizes before a design moves on."""

import pytest
from ingest_samples import (  # noqa: F401 - fixtures
    MemoryCloud,
    batch_body,
    client,
    cloud,
    create,
    design,
    designs,
    item_row,
    owner,
    upload_all,
)

from app.core import storage as storage_mod
from app.core.storage.local import LocalBackend
from app.models import RenderJob


@pytest.fixture()
def batch(client, owner) -> dict:
    body = batch_body(
        design("rings/R-1.3dm", 4_200),
        design("pendants/P 2.obj", 900, companions=[{"filename": "pendants/P 2.mtl", "bytes": 120}]),
    )
    res = create(client, owner[1], body)
    assert res.status_code == 201, res.text
    return res.json()


def _sign(client, headers, batch: dict, item_ids: list[int] | None = None):
    ids = item_ids if item_ids is not None else [item["id"] for item in batch["items"]]
    return client.post(f"/ingest/batches/{batch['id']}/uploads", headers=headers, json={"item_ids": ids})


def _confirm(client, headers, batch: dict, item_ids: list[int] | None = None):
    ids = item_ids if item_ids is not None else [item["id"] for item in batch["items"]]
    return client.post(f"/ingest/batches/{batch['id']}/uploaded", headers=headers, json={"item_ids": ids})


def test_each_file_gets_a_put_with_its_size_and_type_signed_in(client, db, owner, cloud, batch):
    user, headers = owner
    ring, pendant = batch["items"]

    res = _sign(client, headers, batch)

    assert res.status_code == 200
    body = res.json()
    assert body["expires_in"] == 900
    files = body["files"]
    assert [(file["item_id"], file["filename"], file["method"]) for file in files] == [
        (ring["id"], "rings/R-1.3dm", "PUT"),
        (pendant["id"], "pendants/P 2.obj", "PUT"),
        (pendant["id"], "pendants/P 2.mtl", "PUT"),
    ]
    source_key = item_row(db, ring["id"]).source_key
    assert source_key == f"customers/{user.id}/ingest/{batch['id']}/{ring['id']}/R-1.3dm"
    assert files[0]["url"] == f"https://r2.example.com/{source_key}?put"
    assert files[0]["headers"] == {
        "Content-Type": "application/octet-stream",
        "Content-Length": "4200",
        "Content-Disposition": 'attachment; filename="R-1.3dm"',
        "Cache-Control": "public, max-age=31536000, immutable",
    }
    assert cloud.signed_puts[source_key] == {
        "type": "application/octet-stream", "expires": 900, "length": 4200, "disposition": 'attachment; filename="R-1.3dm"',
    }
    companion_key = item_row(db, pendant["id"]).companions[0]["key"]
    assert companion_key.endswith(f"/{pendant['id']}/companions/0-P_2.mtl")
    assert cloud.signed_puts[companion_key]["length"] == 120


def test_storage_refuses_a_file_of_another_size_and_its_design_stays_awaiting(client, db, owner, cloud, batch):
    headers = owner[1]
    files = _sign(client, headers, batch).json()["files"]

    assert cloud.put(files[0]["url"], files[0]["headers"], b"x" * 4_199) == 403
    assert cloud.put(files[0]["url"], {**files[0]["headers"], "Content-Length": "4201"}, b"x" * 4_201) == 403
    confirmed = _confirm(client, headers, batch).json()

    assert [item["status"] for item in confirmed["items"]] == ["awaiting_upload", "awaiting_upload"]
    assert confirmed["missing"] == [
        {"item_id": batch["items"][0]["id"], "message": "R-1.3dm is not uploaded yet."},
        {"item_id": batch["items"][1]["id"], "message": "P 2.obj is not uploaded yet."},
    ]


def test_an_upload_of_another_size_fails_its_check(client, db, owner, cloud, batch):
    """Sizes are checked again when an upload is confirmed, whatever put the object there."""
    headers = owner[1]
    ring = batch["items"][0]
    cloud.objects[item_row(db, ring["id"]).source_key] = b"x" * 5_000

    confirmed = _confirm(client, headers, batch, [ring["id"]]).json()

    assert confirmed["missing"] == [{"item_id": ring["id"], "message": "R-1.3dm: 4,200 bytes declared, 5,000 stored."}]
    assert item_row(db, ring["id"]).status == "awaiting_upload"


def test_a_design_moves_on_only_once_every_one_of_its_files_is_stored(client, db, owner, cloud, batch):
    headers = owner[1]
    pendant = batch["items"][1]
    obj = _sign(client, headers, batch, [pendant["id"]]).json()["files"][0]
    assert cloud.put(obj["url"], obj["headers"], b"x" * 900) == 200

    waiting = _confirm(client, headers, batch, [pendant["id"]]).json()
    upload_all(client, headers, cloud, batch)

    assert waiting["missing"] == [{"item_id": pendant["id"], "message": "P 2.mtl is not uploaded yet."}]
    assert [item_row(db, item["id"]).status for item in batch["items"]] == ["uploaded", "uploaded"]


def test_confirming_again_answers_a_design_as_it_is(client, db, owner, cloud, batch):
    headers = owner[1]
    upload_all(client, headers, cloud, batch)

    again = _confirm(client, headers, batch).json()

    assert ([item["status"] for item in again["items"]], again["missing"]) == (["uploaded", "uploaded"], [])
    assert db.query(RenderJob).count() == 0


def test_a_design_uploaded_after_submitting_starts_converting(client, db, owner, cloud, batch):
    headers = owner[1]
    ring, pendant = batch["items"]
    upload_all(client, headers, cloud, {**batch, "items": [ring]})
    submitted = client.post(f"/ingest/batches/{batch['id']}/submit", headers=headers).json()
    assert submitted["counts"] == {"converting": 1, "awaiting_upload": 1}

    upload_all(client, headers, cloud, {**batch, "items": [pendant]})

    row = item_row(db, pendant["id"])
    assert row.status == "converting"
    job = db.get(RenderJob, row.convert_job_id)
    assert (job.kind, job.batch_id, job.ingest_item_id, job.status) == ("convert", batch["id"], pendant["id"], "queued")


def test_only_designs_awaiting_their_uploads_are_signed(client, db, owner, cloud, batch):
    headers = owner[1]
    upload_all(client, headers, cloud, batch)

    res = _sign(client, headers, batch, [batch["items"][0]["id"]])

    assert res.status_code == 409
    assert res.json()["detail"] == f"Item {batch['items'][0]['id']} is uploaded, not awaiting its upload"


def test_a_finished_batch_takes_no_uploads(client, db, owner, cloud, batch):
    headers = owner[1]
    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    assert _sign(client, headers, batch).status_code == 409
    assert _confirm(client, headers, batch).status_code == 409


@pytest.mark.parametrize("item_ids", [[999], []])
def test_items_must_be_the_batchs(client, owner, batch, item_ids):
    res = _sign(client, owner[1], batch, item_ids)

    assert res.status_code == (404 if item_ids else 422)


def test_at_most_100_designs_a_call(client, db, owner, cloud):
    headers = owner[1]
    batch = create(client, headers, batch_body(*designs(101))).json()
    ids = [item["id"] for item in batch["items"]]

    assert _sign(client, headers, batch, ids).status_code == 422
    assert len(_sign(client, headers, batch, ids[:100]).json()["files"]) == 100


def test_local_storage_takes_no_bulk_uploads(client, owner, batch, tmp_path, monkeypatch):
    """Raw CAD never goes through the API: without cloud storage there is nothing to sign."""
    monkeypatch.setattr(storage_mod, "get_storage", lambda: LocalBackend(tmp_path))

    res = _sign(client, owner[1], batch)

    assert res.status_code == 503
    assert "cloud storage" in res.json()["detail"]


def test_memory_cloud_holds_the_signed_size():
    """The test's stand-in refuses what R2 refuses: another size, or another type."""
    cloud = MemoryCloud()
    url = cloud.presign_put("k", "application/octet-stream", content_length=3)
    headers = {"Content-Type": "application/octet-stream", "Content-Length": "3"}

    assert cloud.put(url, headers, b"abcd") == 403
    assert cloud.put(url, {**headers, "Content-Type": "model/step"}, b"abc") == 403
    assert cloud.put(url, headers, b"abc") == 200
