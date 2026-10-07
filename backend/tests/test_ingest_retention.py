"""The retention sweep (docs/adr/0006-bulk-pipeline.md, "Limits for batches" and "Results", Phase
F3): a finished batch's raw CAD files go 30 days after it finished and its archive's parts 14 days
after they were made, their bytes given back to storage exactly once; nothing before its time, and
never a scene's own files. Sweeping again, or two sweeps at once, changes nothing more."""

from datetime import datetime, timedelta

import pytest

from archive_samples import archiver, finished_batch, small_parts  # noqa: F401 - fixtures
from ingest_samples import batch_row, claim, client, cloud, complete, converted_files, fail, owner  # noqa: F401 - fixtures
from render_samples import api_session, batch_outputs, gpu, planned_batch, scene_of  # noqa: F401 - fixtures

from app.features.billing.quota_service import get_or_create_billing
from app.features.ingest import retention
from app.models import IngestItem, StorageDeletion

DAY = timedelta(days=1)


def ingest_keys(cloud, user_id: int, batch_id: int) -> list[str]:
    return cloud.under(f"customers/{user_id}/ingest/{batch_id}/")


def scene_files(db, cloud, batch: dict) -> dict[str, bytes]:
    """Every file the batch's scenes hold: models, thumbnails, renders and published copies."""
    found = {}
    for item in batch["items"]:
        scene = scene_of(db, item["id"])
        if scene is None:
            continue
        found |= {key: cloud.objects[key] for key in (scene.model_key, scene.thumbnail_key)}
        found |= {key: data for key, data in cloud.objects.items() if key.startswith(f"published/{scene.user_id}/{scene.sku}/")}
    found |= {output.key: cloud.objects[output.key] for output in batch_outputs(db, batch["id"])}
    return found


def expire(db, batch_id: int, *, sources: bool = False, archive: bool = False) -> None:
    row = batch_row(db, batch_id)
    if sources:
        row.expires_at = datetime.utcnow() - DAY
    if archive:
        row.archive_expires_at = datetime.utcnow() - DAY
    db.commit()


def test_raw_cad_files_go_once_their_batch_expires_and_nothing_else(client, db, owner, cloud, gpu):
    user, headers = owner
    expired = finished_batch(client, headers, cloud, db, gpu, count=2)
    kept = finished_batch(client, headers, cloud, db, gpu, count=1, prefix="P")
    for batch in (expired, kept):
        assert batch_row(db, batch["id"]).expires_at > datetime.utcnow() + 29 * DAY
        assert len(ingest_keys(cloud, user.id, batch["id"])) == len(batch["items"])
    scenes_before = scene_files(db, cloud, expired)
    storage_before = get_or_create_billing(db, user).storage_bytes_used
    expire(db, expired["id"], sources=True)

    result = retention.sweep_expired(db)

    assert (result.sources_batches, result.source_files, result.failures) == (1, 2, 0)
    assert ingest_keys(cloud, user.id, expired["id"]) == []
    assert len(ingest_keys(cloud, user.id, kept["id"])) == 1
    assert scene_files(db, cloud, expired) == scenes_before  # every scene file stays
    assert batch_row(db, expired["id"]).sources_deleted_at is not None
    assert batch_row(db, kept["id"]).sources_deleted_at is None
    assert get_or_create_billing(db, user).storage_bytes_used == storage_before  # raw CAD never counted
    assert retention.sweep_expired(db) == retention.SweepResult()  # the second run finds nothing to do


def test_the_sweep_never_deletes_a_key_outside_the_designs_own_folder(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=1)
    scene = scene_of(db, batch["items"][0]["id"])
    item = db.get(IngestItem, batch["items"][0]["id"])
    item.companions = [{"filename": "ring.glb", "key": scene.model_key, "bytes": 1}]  # as a bad row might
    db.commit()
    expire(db, batch["id"], sources=True)

    retention.sweep_expired(db)

    assert scene.model_key in cloud.objects
    assert ingest_keys(cloud, user.id, batch["id"]) == []


def test_an_unfinished_or_unexpired_batch_keeps_its_files(client, db, owner, cloud):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, count=1)  # converting
    row = batch_row(db, batch["id"])
    row.expires_at = datetime.utcnow() - DAY  # never set while processing, but even so
    db.commit()

    assert retention.sweep_expired(db).sources_batches == 0
    assert len(ingest_keys(cloud, user.id, batch["id"])) == 1


def test_an_archive_goes_once_it_expires_and_gives_its_bytes_back_exactly_once(client, db, owner, cloud, gpu, archiver, small_parts):
    user, headers = owner
    expired = finished_batch(client, headers, cloud, db, gpu, count=1)
    kept = finished_batch(client, headers, cloud, db, gpu, count=1, prefix="P")
    storage_before = get_or_create_billing(db, user).storage_bytes_used
    for batch in (expired, kept):
        client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers)
        archiver.build()
    expired_parts = list(batch_row(db, expired["id"]).archive_keys)
    kept_parts = list(batch_row(db, kept["id"]).archive_keys)
    expired_job = batch_row(db, expired["id"]).archive_job_id
    kept_bytes = sum(part["bytes"] for part in kept_parts)
    assert get_or_create_billing(db, user).storage_bytes_used == storage_before + kept_bytes + sum(p["bytes"] for p in expired_parts)
    scenes_before = scene_files(db, cloud, expired)
    expire(db, expired["id"], archive=True)

    result = retention.sweep_expired(db)

    assert (result.archives, result.archive_bytes) == (1, sum(part["bytes"] for part in expired_parts))
    assert not any(part["key"] in cloud.objects for part in expired_parts)
    assert all(part["key"] in cloud.objects for part in kept_parts)
    row = batch_row(db, expired["id"])
    assert (row.archive_keys, row.archive_job_id, row.archive_expires_at) == (None, None, None)
    assert get_or_create_billing(db, user).storage_bytes_used == storage_before + kept_bytes
    assert scene_files(db, cloud, expired) == scenes_before
    assert client.get(f"/ingest/batches/{expired['id']}/archive/1", headers=headers).status_code == 404

    # Again, and as a second sweep that read the batch before the first took its parts: no more bytes back.
    assert retention.sweep_expired(db).archives == 0
    retention.sweep_archive(db, expired["id"], user.id, expired_job, expired_parts, datetime.utcnow(), retention.SweepResult())
    assert get_or_create_billing(db, user).storage_bytes_used == storage_before + kept_bytes


def test_an_expired_archive_downloads_no_more_before_the_sweep_takes_it(client, db, owner, cloud, gpu, archiver):
    batch = finished_batch(client, owner[1], cloud, db, gpu, count=1)
    client.post(f"/ingest/batches/{batch['id']}/archive", headers=owner[1])
    archiver.build()
    expire(db, batch["id"], archive=True)

    assert client.get(f"/ingest/batches/{batch['id']}/archive/1", headers=owner[1]).status_code == 404
    assert client.get(f"/ingest/batches/{batch['id']}", headers=owner[1]).json()["archive"]["parts"] == []


def queued(db) -> list[tuple[str, str]]:
    """The files waiting to be deleted, as (reason, key)."""
    db.expire_all()
    return sorted((row.reason, row.key) for row in db.query(StorageDeletion))


def test_a_file_that_cant_be_deleted_stays_queued_for_the_next_run(client, db, owner, cloud, gpu, monkeypatch):
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=2)
    expire(db, batch["id"], sources=True)
    [stuck, _] = ingest_keys(cloud, user.id, batch["id"])
    real_delete = cloud.delete

    def flaky_delete(key: str) -> None:
        if key == stuck:
            raise RuntimeError("storage is down")
        real_delete(key)

    monkeypatch.setattr(cloud, "delete", flaky_delete)
    result = retention.sweep_expired(db)
    assert (result.sources_batches, result.deleted, result.failures) == (1, 1, 1)
    assert batch_row(db, batch["id"]).sources_deleted_at is not None  # claimed: nothing converts from it again
    assert ingest_keys(cloud, user.id, batch["id"]) == [stuck]
    [row] = db.query(StorageDeletion).all()
    assert (row.key, row.reason, row.attempts, row.last_error) == (stuck, "raw_cad", 1, "storage is down")

    monkeypatch.setattr(cloud, "delete", real_delete)
    result = retention.sweep_expired(db)
    assert (result.sources_batches, result.deleted, result.failures) == (0, 1, 0)
    assert ingest_keys(cloud, user.id, batch["id"]) == []
    assert queued(db) == []


def test_a_sweep_that_stops_after_its_claims_leaves_nothing_behind_and_gives_bytes_back_once(
    client, db, owner, cloud, gpu, archiver, monkeypatch
):
    """The process dies once the claims are committed, before a file is deleted: the next sweep
    finds the files queued and deletes them, and the archive's bytes went back with its claim only."""
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=2)
    client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers)
    archiver.build()
    parts = list(batch_row(db, batch["id"]).archive_keys)
    storage_before = get_or_create_billing(db, user).storage_bytes_used
    expire(db, batch["id"], sources=True, archive=True)
    raw_files = ingest_keys(cloud, user.id, batch["id"])

    def crash(*_args, **_kwargs):
        raise SystemExit("killed")

    with monkeypatch.context() as patched:
        patched.setattr(retention, "drain_deletions", crash)
        with pytest.raises(SystemExit):
            retention.sweep_expired(db)

    row = batch_row(db, batch["id"])
    assert row.sources_deleted_at is not None and row.archive_job_id is None
    assert ingest_keys(cloud, user.id, batch["id"]) == raw_files  # nothing deleted yet
    assert all(part["key"] in cloud.objects for part in parts)
    assert queued(db) == sorted([("archive_expired", part["key"]) for part in parts] + [("raw_cad", key) for key in raw_files])
    released = get_or_create_billing(db, user).storage_bytes_used
    assert released == storage_before - sum(part["bytes"] for part in parts)

    result = retention.sweep_expired(db)

    assert (result.sources_batches, result.archives, result.deleted, result.failures) == (0, 0, len(raw_files) + len(parts), 0)
    assert ingest_keys(cloud, user.id, batch["id"]) == []
    assert not any(part["key"] in cloud.objects for part in parts)
    assert queued(db) == []
    assert get_or_create_billing(db, user).storage_bytes_used == released  # not given back twice


def test_deleting_a_queued_file_that_is_gone_already_succeeds(db, cloud):
    from app.features.ingest.deletions import drain_deletions, queue_deletions

    ids = queue_deletions(db, ["customers/7/ingest/1/1/gone.stl", "published/7/R-1/model.glb"], reason="raw_cad")
    db.commit()

    assert len(ids) == 1  # only a customer's private files are ever queued
    assert (drain_deletions(db).deleted, queued(db)) == (1, [])


def test_a_design_whose_cad_file_expired_cant_convert_again(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, count=2)
    first, second = claim(db), claim(db)
    complete(db, first, converted_files(cloud, first))
    fail(db, second, code="timeout", retryable=False)
    gpu.run_all()
    assert batch_row(db, batch["id"]).status == "completed_with_errors"
    expire(db, batch["id"], sources=True)

    refused = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers).json()
    assert refused["retried"] == []
    assert [(one["item_id"], one["code"]) for one in refused["refused"]] == [(batch["items"][1]["id"], "source_deleted")]

    retention.sweep_expired(db)
    assert client.post(f"/ingest/batches/{batch['id']}/items/{batch['items'][1]['id']}/retry", headers=headers).status_code == 409


def test_the_cli_reports_what_it_deleted(client, db, owner, cloud, gpu, monkeypatch, capsys):
    from contextlib import nullcontext

    from scripts import sweep_ingest_retention

    batch = finished_batch(client, owner[1], cloud, db, gpu, count=1)
    expire(db, batch["id"], sources=True)
    monkeypatch.setattr(sweep_ingest_retention, "SessionLocal", lambda: nullcontext(db))

    assert sweep_ingest_retention.main() == 0
    out = capsys.readouterr().out
    assert "raw CAD files claimed : 1 of 1 batch(es)" in out and "files deleted         : 1" in out
