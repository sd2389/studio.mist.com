"""A batch's results (docs/adr/0006-bulk-pipeline.md, "Results", Phase F3): the manifest, a CSV row
per design with its links, formula-safe; and the archive, a batch_archive job whose ZIP parts hold
every output and the manifest, kept on the batch and downloaded through signed links. Only the
batch's owner reads either."""

import csv
import io
import zipfile
from datetime import datetime, timedelta

import pytest
from archive_samples import archiver, finished_batch, signed_key, unzip  # noqa: F401 - fixtures
from fastapi import HTTPException
from ingest_samples import (  # noqa: F401 - fixtures
    SIGNED,
    batch_body,
    batch_row,
    claim,
    client,
    cloud,
    complete,
    converted_files,
    design,
    fail,
    other,
    owner,
    submitted_batch,
)
from render_samples import DEFAULT_PLAN, api_session, batch_outputs, gpu, planned_batch, scene_of  # noqa: F401 - fixtures

from app.config import get_settings
from app.core import storage as storage_mod
from app.core.storage.local import LocalBackend
from app.features.billing.plans import get_quotas
from app.features.billing.quota_service import get_or_create_billing
from app.features.ingest.manifest import COLUMNS, formula_safe
from app.models import Render, RenderJob

APP = get_settings().app_public_url.rstrip("/")


def manifest(client, headers, batch_id: int) -> list[dict[str, str]]:
    res = client.get(f"/ingest/batches/{batch_id}/manifest.csv", headers=headers)
    assert res.status_code == 200, res.text
    reader = csv.DictReader(io.StringIO(res.text))
    assert tuple(reader.fieldnames) == COLUMNS
    return list(reader)


def api_path(app_link: str) -> str:
    """The API route an app link goes through: the studio's /api proxy, less its prefix."""
    assert app_link.startswith(f"{APP}/api/"), app_link
    return app_link.removeprefix(f"{APP}/api")


def outputs_by_label(db, batch_id: int, sku_item_id: int) -> dict[str, Render]:
    jobs = {job.id for job in db.query(RenderJob).filter(RenderJob.ingest_item_id == sku_item_id)}
    return {(output.label or output.kind): output for output in batch_outputs(db, batch_id) if output.job_id in jobs}


# ---------------------------------------------------------------------------
# The manifest
# ---------------------------------------------------------------------------


def test_the_manifest_has_a_row_per_design_with_its_status_embed_link_and_a_link_to_each_output(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, count=3)
    converting = [claim(db) for _ in range(3)]
    for job in converting[:2]:
        complete(db, job, converted_files(cloud, job))
    fail(db, converting[2])
    gpu.run_all()

    res = client.get(f"/ingest/batches/{batch['id']}/manifest.csv", headers=headers)
    assert res.headers["content-type"] == "text/csv; charset=utf-8"
    assert res.headers["content-disposition"] == 'attachment; filename="Autumn-rings-manifest.csv"'
    rows = manifest(client, headers, batch["id"])

    assert [(row["sku"], row["name"], row["category"], row["status"]) for row in rows] == [
        ("R-1", "R-1", "Ring", "done"), ("R-2", "R-2", "Ring", "done"), ("R-3", "R-3", "Ring", "failed"),
    ]
    first, _, failed = rows
    made = outputs_by_label(db, batch["id"], batch["items"][0]["id"])
    assert first["embed_url"] == f"{APP}/embed/R-1"
    for angle, column in (("front", "still_front"), ("three-quarter", "still_three_quarter"), ("side", "still_side"), ("top", "still_top")):
        assert first[column] == f"{APP}/api/render-jobs/{made[angle].job_id}/outputs/{made[angle].id}/download"
    assert first["turntable_mp4"] == f"{APP}/api/render-jobs/{made['turntable'].job_id}/outputs/{made['turntable'].id}/download"
    assert first["thumbnail"] == f"{APP}/api/files/{scene_of(db, batch['items'][0]['id']).thumbnail_key}"
    assert (first["spin_zip"], first["error"]) == ("", "")  # the plan makes no spin
    assert {column: failed[column] for column in COLUMNS if column not in ("sku", "name", "category", "status")} == {
        **{column: "" for column in COLUMNS if column not in ("sku", "name", "category", "status", "error")},
        "error": "model_unreadable: model_unreadable!",
    }


def test_without_publish_media_the_links_open_only_for_their_signed_in_owner(client, db, owner, other, cloud, gpu):
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=1)
    [row] = manifest(client, headers, batch["id"])

    for column in ("still_front", "turntable_mp4", "thumbnail"):
        path = api_path(row[column])
        opened = client.get(path, headers=headers, follow_redirects=False)
        assert opened.status_code == 302, (column, opened.text)
        assert cloud.objects[signed_key(opened.headers["location"])]  # a signed link to the stored file
        assert client.get(path, headers=other[1], follow_redirects=False).status_code == 404, column
        assert client.get(path, follow_redirects=False).status_code == 401, column


def test_with_publish_media_the_links_are_the_public_copies(client, db, owner, cloud, gpu, monkeypatch):
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=1, plan={**DEFAULT_PLAN, "publish_media": True})
    made = outputs_by_label(db, batch["id"], batch["items"][0]["id"])
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://pub.example.com")
    get_settings.cache_clear()
    try:
        [row] = manifest(client, headers, batch["id"])
    finally:
        get_settings.cache_clear()

    for label, column in (("front", "still_front"), ("top", "still_top"), ("turntable", "turntable_mp4")):
        public_key = made[label].public_key
        assert row[column] == f"https://pub.example.com/{public_key}"
        assert cloud.objects[public_key] == cloud.objects[made[label].key]  # the copy is there to open
    assert row["thumbnail"] == f"https://pub.example.com/published/{user.id}/R-1/thumbnail.webp"
    assert cloud.objects[f"published/{user.id}/R-1/thumbnail.webp"]
    assert row["embed_url"] == f"{APP}/embed/R-1"


@pytest.mark.parametrize("value", ["=HYPERLINK(\"http://x\")", "+44 20", "-5 ring", "@SUM(A1)", "\tcmd", "\rcmd"])
def test_a_cell_that_starts_as_a_formula_gets_a_leading_quote(value):
    assert formula_safe(value) == f"'{value}"


@pytest.mark.parametrize("value", ["Solitaire 1 ct", "R-1001", "", "a=b", "https://studio.mist.com/embed/R-1"])
def test_other_cells_are_left_as_they_are(value):
    assert formula_safe(value) == value


def test_the_manifest_escapes_names_a_spreadsheet_would_run(client, db, owner, cloud):
    names = ['=HYPERLINK("https://evil.example","x")', "+1+1", "@SUM(1)", "-2+3", "Plain ring"]
    items = [design(f"rings/R-{number}.stl", 900 + number, name=name) for number, name in enumerate(names, start=1)]
    batch = submitted_batch(client, owner[1], cloud, batch_body(*items))

    rows = manifest(client, owner[1], batch["id"])

    assert [row["name"] for row in rows] == [f"'{name}" for name in names[:4]] + ["Plain ring"]
    assert all(row["status"] == "converting" for row in rows)  # it is current at every stage


def test_another_user_cant_fetch_the_manifest_or_the_archive(client, db, owner, other, cloud, gpu, archiver):
    batch = finished_batch(client, owner[1], cloud, db, gpu, count=1)
    assert client.post(f"/ingest/batches/{batch['id']}/archive", headers=owner[1]).status_code == 201
    archiver.build()

    for method, path in (
        ("get", f"/ingest/batches/{batch['id']}/manifest.csv"),
        ("post", f"/ingest/batches/{batch['id']}/archive"),
        ("get", f"/ingest/batches/{batch['id']}/archive/1"),
    ):
        res = getattr(client, method)(path, headers=other[1], follow_redirects=False)
        assert res.status_code == 404, (path, res.text)
    assert client.get(f"/ingest/batches/{batch['id']}/archive/1", headers=owner[1], follow_redirects=False).status_code == 302


# ---------------------------------------------------------------------------
# The archive
# ---------------------------------------------------------------------------


def test_an_archive_is_built_once_the_batch_has_finished_and_asking_again_answers_the_same_job(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, count=1)
    assert client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers).status_code == 409  # still converting
    from render_samples import convert_all

    convert_all(db, cloud)
    gpu.run_all()

    first = client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers)
    again = client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers)
    keyed = client.post(f"/ingest/batches/{batch['id']}/archive", headers={**headers, "Idempotency-Key": "zip-1"})

    assert (first.status_code, again.status_code, keyed.status_code) == (201, 200, 200)
    job = first.json()["job"]
    assert again.json()["job"]["id"] == keyed.json()["job"]["id"] == job["id"]
    assert (job["kind"], job["status"], job["credits"], job["credit_state"]) == ("batch_archive", "queued", 0, "none")
    row = db.get(RenderJob, job["id"])
    assert (row.scene_id, row.batch_id, row.priority, row.spec["part_bytes"]) == (None, batch["id"], 10, 2 * 1024**3)
    assert client.get(f"/ingest/batches/{batch['id']}", headers=headers).json()["archive"]["job"]["id"] == job["id"]


def test_the_archive_parts_hold_every_output_and_the_manifest_once(client, db, owner, cloud, gpu, archiver):
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=2)
    storage_before = get_or_create_billing(db, user).storage_bytes_used
    assert client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers).status_code == 201

    job = archiver.build(first_part_files=4)

    assert (job.status, job.credit_state, job.renderer) == ("completed", "none", None)
    archive = client.get(f"/ingest/batches/{batch['id']}", headers=headers).json()["archive"]
    assert [(part["part"], part["name"], part["files"]) for part in archive["parts"]] == [
        (1, "Autumn-rings-part-1.zip", 5), (2, "Autumn-rings-part-2.zip", 8),
    ]
    made_at = datetime.fromisoformat(archive["made_at"].removesuffix("Z"))
    assert datetime.fromisoformat(archive["expires_at"].removesuffix("Z")) - made_at == timedelta(days=14)
    stored = [part["key"] for part in batch_row(db, batch["id"]).archive_keys]
    first, second = (unzip(cloud.objects[key]) for key in stored)
    assert list(first)[0] == "manifest.csv" and "manifest.csv" not in second
    names = [*first, *second]
    assert len(names) == len(set(names))  # each file once
    archived = {**first, **second}
    expected = {"manifest.csv": None}
    for item in batch["items"]:
        sku = item["sku"]
        expected[f"{sku}/thumbnail.webp"] = scene_of(db, item["id"]).thumbnail_key
        for label, output in outputs_by_label(db, batch["id"], item["id"]).items():
            path = f"{sku}/video/turntable.mp4" if label == "turntable" else f"{sku}/stills/{label}.jpg"
            expected[path] = output.key
    assert set(archived) == set(expected) and len(expected) == 1 + 2 * 6
    for path, key in expected.items():
        if key is not None:
            assert archived[path] == cloud.objects[key], path
    assert first["manifest.csv"].decode() == client.get(f"/ingest/batches/{batch['id']}/manifest.csv", headers=headers).text
    parts_bytes = sum(len(cloud.objects[key]) for key in stored)
    assert get_or_create_billing(db, user).storage_bytes_used == storage_before + parts_bytes

    download = client.get(f"/ingest/batches/{batch['id']}/archive/2", headers=headers, follow_redirects=False)
    assert download.status_code == 302 and signed_key(download.headers["location"]) == stored[1]
    assert "expires=300" in download.headers["location"]
    assert client.get(f"/ingest/batches/{batch['id']}/archive/3", headers=headers).status_code == 404


def test_the_payload_names_each_file_where_it_goes_and_signs_it_for_the_jobs_run_time(client, db, owner, cloud, gpu, archiver):
    batch = finished_batch(client, owner[1], cloud, db, gpu, count=1)
    client.post(f"/ingest/batches/{batch['id']}/archive", headers=owner[1])

    payload = archiver.payload(archiver.claim_one())

    assert payload.manifest_name == "manifest.csv"
    assert [file.path for file in payload.files] == [
        "R-1/thumbnail.webp", "R-1/stills/front.jpg", "R-1/stills/three-quarter.jpg", "R-1/stills/side.jpg",
        "R-1/stills/top.jpg", "R-1/video/turntable.mp4",
    ]
    assert payload.files[0].bytes is None and payload.files[0].max_bytes == 2 * 1024 * 1024  # a thumbnail's size isn't kept
    assert all(file.bytes == len(cloud.objects[signed_key(file.source.url)]) for file in payload.files[1:])
    assert all("expires=1800" in file.source.url for file in payload.files)


def test_parts_are_numbered_from_one_with_none_left_out(client, db, owner, cloud, gpu, archiver):
    batch = finished_batch(client, owner[1], cloud, db, gpu, count=1)
    client.post(f"/ingest/batches/{batch['id']}/archive", headers=owner[1])
    job = archiver.claim_one()
    parts = archiver.parts(job, first_part_files=2)
    renamed = [(f"{job.spec['stem']}-part-2.zip", parts[0][1], parts[0][2])]

    with pytest.raises(HTTPException) as refused:
        archiver.complete(job, archiver.upload(job, renamed))

    assert refused.value.status_code == 400
    db.expire_all()
    assert db.get(RenderJob, job.id).status == "running"


def test_a_new_archive_replaces_the_last_and_gives_its_bytes_back(client, db, owner, cloud, gpu, archiver):
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=1)
    storage_before = get_or_create_billing(db, user).storage_bytes_used
    client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers)
    archiver.build(first_part_files=2)
    old_keys = [part["key"] for part in batch_row(db, batch["id"]).archive_keys]

    assert client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers).status_code == 201
    newer = archiver.build()

    row = batch_row(db, batch["id"])
    assert row.archive_job_id == newer.id and len(row.archive_keys) == 1
    assert not any(key in cloud.objects for key in old_keys)
    assert get_or_create_billing(db, user).storage_bytes_used == storage_before + row.archive_keys[0]["bytes"]


def test_an_archive_that_storage_cant_take_ends_and_its_parts_go(client, db, owner, cloud, gpu, archiver):
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=1)
    client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers)
    job = archiver.claim_one()
    reports = archiver.upload(job, archiver.parts(job))
    billing = get_or_create_billing(db, user)
    billing.storage_bytes_used = get_quotas("studio").storage_bytes  # the plan's whole allowance
    db.commit()

    with pytest.raises(HTTPException) as refused:
        archiver.complete(job, reports)

    assert refused.value.status_code == 402
    db.expire_all()
    assert (db.get(RenderJob, job.id).status, db.get(RenderJob, job.id).error_code) == ("failed", "over_limit")
    assert reports[0]["key"] not in cloud.objects
    assert batch_row(db, batch["id"]).archive_keys is None


def test_an_archive_neither_holds_its_batch_open_nor_is_canceled_with_it(client, db, owner, cloud, gpu, archiver):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, count=2)
    first, second = claim(db), claim(db)
    complete(db, first, converted_files(cloud, first))
    fail(db, second, code="timeout", retryable=False)
    gpu.run_all()
    assert batch_row(db, batch["id"]).status == "completed_with_errors"
    archive_job = client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers).json()["job"]

    retried = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers)
    assert retried.status_code == 200 and retried.json()["retried"] == [batch["items"][1]["id"]]
    assert client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers).json()["status"] == "canceled"

    db.expire_all()
    assert db.get(RenderJob, archive_job["id"]).status == "queued"
    assert archiver.build().status == "completed"


def test_every_job_but_an_archive_says_what_drew_it(client, db, owner, cloud, gpu):
    from render_samples import STILL, convert_all

    from app.features.render_jobs import outputs
    from app.schemas.render_job import RenderJobCompleteRequest

    planned_batch(client, owner[1], cloud, count=1)
    convert_all(db, cloud)
    job = gpu.claim_kind("angle_set")
    reports = []
    for name, camera in zip(job.spec["output_names"], job.spec["cameras"], strict=True):
        key = f"customers/{job.user_id}/renders/{job.id}/{name}"
        cloud.objects[key] = STILL
        reports.append({
            "name": name, "key": key, "content_type": "image/jpeg", "bytes": len(STILL),
            "width": 2000, "height": 2000, "label": camera["angle"],
        })

    with pytest.raises(HTTPException) as refused:
        outputs.complete_job(db, job.id, job.worker_token, RenderJobCompleteRequest.model_validate({"outputs": reports}))

    assert (refused.value.status_code, refused.value.detail) == (400, "renderer: what drew the job is required")


def test_on_local_storage_an_archive_goes_through_the_api_from_payload_to_download(
    client, db, owner, other, cloud, gpu, archiver, tmp_path, monkeypatch
):
    """Local storage signs nothing: the worker reads each file from the API's job routes with its
    token, PUTs its parts to the API and completes over HTTP, as the real one does."""
    user, headers = owner
    batch = finished_batch(client, headers, cloud, db, gpu, count=1)
    client.post(f"/ingest/batches/{batch['id']}/archive", headers=headers)
    local = LocalBackend(tmp_path / "uploads")
    for key, data in cloud.objects.items():
        local.put_bytes(key, data)
    monkeypatch.setattr(storage_mod, "get_storage", lambda: local)
    job = archiver.claim_one()
    token = {"X-Job-Token": job.worker_token}

    payload = client.get(f"/render-jobs/{job.id}/payload", headers=token)
    assert payload.status_code == 200, payload.text
    payload = payload.json()
    assert payload["kind"] == "batch_archive" and payload["spec"]["stem"] == "Autumn-rings"
    entries = [(payload["manifest_name"], payload["manifest"].encode())]
    for file in payload["files"]:
        assert file["source"]["path"].startswith(f"/render-jobs/{job.id}/inputs/")
        fetched = client.get(file["source"]["path"], headers=token)
        assert fetched.status_code == 200, file
        entries.append((file["path"], fetched.content))
    assert client.get(payload["files"][1]["source"]["path"], headers={"X-Job-Token": "wrong"}).status_code == 401
    assert client.get(f"/render-jobs/{job.id}/inputs/renders/999999", headers=token).status_code == 404
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, data in entries:
            archive.writestr(name, data)
    part = buffer.getvalue()
    name = "Autumn-rings-part-1.zip"
    signed = client.post(
        f"/render-jobs/{job.id}/uploads", headers=token, json={"files": [{"name": name, "content_type": "application/zip", "bytes": len(part)}]}
    ).json()["files"][0]
    assert signed["url"] == f"/render-jobs/{job.id}/uploads/{name}"
    assert client.put(signed["url"], headers={**token, **signed["headers"]}, content=part).status_code == 204
    done = client.post(f"/render-jobs/{job.id}/complete", headers=token, json={"outputs": [{
        "name": name, "key": signed["key"], "content_type": "application/zip", "bytes": len(part),
        "width": None, "height": None, "label": None, "meta": {"files": len(entries)},
    }], "renderer": None})
    assert done.status_code == 200 and done.json()["status"] == "completed", done.text

    download = client.get(f"/ingest/batches/{batch['id']}/archive/1", headers=headers)
    assert download.status_code == 200 and download.content == part
    assert 'filename="Autumn-rings-part-1.zip"' in download.headers["content-disposition"]
    assert set(unzip(download.content)) == {"manifest.csv", *(file["path"] for file in payload["files"])}
    assert client.get(f"/ingest/batches/{batch['id']}/archive/1", headers=other[1]).status_code == 404
