"""Convert jobs (docs/adr/0006-bulk-pipeline.md, "Conversion jobs"): each design a batch submits
becomes a `convert` render job carrying its CAD file and the scene it becomes; a worker claims it,
reads its payload and uploads a GLB, a thumbnail and conversion.json; completing it makes the
design's scene exactly once, after the same checks a direct upload passes, and settles the batch."""

import json
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from ingest_samples import (  # noqa: F401 - fixtures
    RENDERER,
    STILLS_PLAN,
    THUMBNAIL,
    WORKER_SETTINGS,
    balances,
    batch_body,
    batch_row,
    claim,
    client,
    cloud,
    complete,
    conversion_report,
    converted_files,
    create,
    design,
    designs,
    fail,
    item_row,
    other,
    owner,
    sign_in,
    submitted_batch,
)
from model_samples import REAL_GLB, REAL_GLB_TRIANGLES, RENAMED_FILES, TRUNCATED_GLB, glb, glb_with_triangles, mesh_doc

from app.config import get_settings
from app.core import storage as storage_mod
from app.core.storage.local import LocalBackend
from app.features.billing.quota_service import get_or_create_billing
from app.features.ingest import conversions
from app.features.render_jobs import outputs, worker
from app.features.render_jobs import payload as payloads
from app.features.render_jobs.service import cancel_job
from app.main import app
from app.models import Scene
from app.schemas.render_job import RenderJobUploadFile

STUDIO = (500, 1500)


def _storage_used(db, user) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.storage_bytes_used


def _scenes(db) -> list[Scene]:
    db.expire_all()
    return db.query(Scene).order_by(Scene.id).all()


def _error(call) -> HTTPException:
    with pytest.raises(HTTPException) as exc:
        call()
    return exc.value


@pytest.fixture()
def converting(client, db, owner, cloud) -> dict:
    """A submitted batch of one design, its convert job claimed by a worker."""
    body = batch_body(
        design("rings/R-1001.obj", 4_200, sku="R-1001", name="Solitaire", category="Ring", note="1 ct",
               units="mm", companions=[{"filename": "rings/R-1001.mtl", "bytes": 300}]),
    )
    batch = submitted_batch(client, owner[1], cloud, body)
    job = claim(db)
    assert job is not None and job.kind == "convert"
    return {"batch": batch, "item": batch["items"][0], "job": job}


# ---------------------------------------------------------------------------
# The job and its payload
# ---------------------------------------------------------------------------


def test_a_design_becomes_a_convert_job_with_its_file_and_the_scene_it_becomes(db, owner, converting):
    user = owner[0]
    job, item = converting["job"], item_row(db, converting["item"]["id"])

    assert (job.scene_id, job.batch_id, job.ingest_item_id, job.look) == (None, converting["batch"]["id"], item.id, None)
    assert job.spec == {
        "item_id": item.id,
        "source": {"key": item.source_key, "filename": "R-1001.obj", "bytes": 4_200},
        "companions": [{"key": item.companions[0]["key"], "filename": "R-1001.mtl", "bytes": 300}],
        "units": "mm",
        "max_polygons": 2_000_000,
        "decimate": "auto",
        "thumbnail": {"size": 512, "format": "webp"},
        "scene": {"sku": "R-1001", "name": "Solitaire", "category": "Ring", "note": "1 ct"},
        "output_names": ["model.glb", "thumbnail.webp", "conversion.json"],
    }
    assert item.source_key.startswith(f"customers/{user.id}/ingest/")


def test_a_worker_claims_convert_jobs_only_when_it_asks_for_them(client, db, owner, cloud):
    submitted_batch(client, owner[1], cloud)

    assert worker.claim_job(db, "gpu-a-1", ["still", "angle_set"], WORKER_SETTINGS) is None
    assert claim(db).kind == "convert"


def test_the_payload_signs_the_designs_file_and_companions(db, cloud, converting):
    job = converting["job"]
    spec = job.spec

    payload = payloads.job_payload(db, job.id, job.worker_token).model_dump(mode="json")

    assert payload == {
        "kind": "convert",
        "spec": spec,
        "source": {"url": f"https://r2.example.com/{spec['source']['key']}?get&expires=900"},
        "companions": [{"url": f"https://r2.example.com/{spec['companions'][0]['key']}?get&expires=900"}],
        "limits": {"max_edge": 512, "max_runtime_seconds": 600},
    }


def test_on_local_storage_the_payload_names_the_api_routes_for_the_files(db, converting, tmp_path, monkeypatch):
    job = converting["job"]
    local = LocalBackend(tmp_path)
    monkeypatch.setattr(storage_mod, "get_storage", lambda: local)
    local.put_bytes(job.spec["source"]["key"], b"o ring")
    local.put_bytes(job.spec["companions"][0]["key"], b"newmtl gold")

    payload = payloads.job_payload(db, job.id, job.worker_token)
    source = payloads.convert_source_file(db, job.id, job.worker_token)
    companion = payloads.convert_companion_file(db, job.id, job.worker_token, 0)

    assert payload.source.model_dump() == {"path": f"/render-jobs/{job.id}/inputs/source"}
    assert [entry.model_dump() for entry in payload.companions] == [{"path": f"/render-jobs/{job.id}/inputs/companions/0"}]
    assert (source.path, companion.path) == (local.local_file_if_exists(job.spec["source"]["key"]), local.local_file_if_exists(job.spec["companions"][0]["key"]))
    assert _error(lambda: payloads.convert_companion_file(db, job.id, job.worker_token, 1)).status_code == 404
    assert _error(lambda: payloads.convert_source_file(db, job.id, "wrong")).status_code == 401


def test_on_local_storage_a_conversion_goes_through_the_api_from_payload_to_scene(db, owner, converting, tmp_path, monkeypatch):
    """Local storage signs nothing: the worker reads the design's file and PUTs its own through
    the API, with the job token, and completing makes the scene as on cloud storage."""
    import asyncio

    user, job = owner[0], converting["job"]
    local = LocalBackend(tmp_path / "uploads")
    monkeypatch.setattr(storage_mod, "get_storage", lambda: local)
    local.put_bytes(job.spec["source"]["key"], b"o ring")

    async def body(data: bytes):
        yield data

    files = [("model.glb", "model/gltf-binary", REAL_GLB), ("conversion.json", "application/json", json.dumps(conversion_report()).encode())]
    targets = outputs.upload_targets(
        db, job.id, job.worker_token, [RenderJobUploadFile.model_validate({"name": name, "content_type": kind, "bytes": len(data)}) for name, kind, data in files]
    )
    for name, kind, data in files:
        asyncio.run(outputs.save_local_upload(db, job.id, job.worker_token, name, kind, body(data)))
    done = complete(db, job, [
        {"name": name, "key": target.key, "content_type": kind, "bytes": len(data), "width": None, "height": None}
        for target, (name, kind, data) in zip(targets, files, strict=True)
    ])

    assert [target.url for target in targets] == [f"/render-jobs/{job.id}/uploads/{name}" for name, _, _ in files]
    assert done.status == "completed"
    [scene] = _scenes(db)
    assert local.get_bytes(scene.model_key) == REAL_GLB
    assert local.local_file_if_exists(f"published/{user.id}/R-1001/model.glb") is not None


def test_a_convert_jobs_uploads_are_its_three_files(db, cloud, converting):
    job = converting["job"]
    files = [
        {"name": "model.glb", "content_type": "model/gltf-binary", "bytes": 1000},
        {"name": "thumbnail.webp", "content_type": "image/webp", "bytes": 100},
        {"name": "conversion.json", "content_type": "application/json", "bytes": 10},
    ]

    targets = outputs.upload_targets(db, job.id, job.worker_token, [RenderJobUploadFile.model_validate(file) for file in files])
    wrong_type = _error(lambda: outputs.upload_targets(db, job.id, job.worker_token, [RenderJobUploadFile.model_validate({**files[1], "content_type": "image/png"})]))
    too_large = _error(lambda: outputs.upload_targets(db, job.id, job.worker_token, [RenderJobUploadFile.model_validate({**files[2], "bytes": 2 * 1024 * 1024})]))

    assert [target.key for target in targets] == [f"customers/{job.user_id}/renders/{job.id}/{file['name']}" for file in files]
    assert targets[0].headers["Content-Type"] == "model/gltf-binary"
    assert (wrong_type.status_code, too_large.status_code) == (400, 400)


# ---------------------------------------------------------------------------
# Completing: one scene, after the upload checks
# ---------------------------------------------------------------------------


def test_a_completed_conversion_makes_exactly_one_scene_as_an_upload_would(db, owner, cloud, converting):
    user, job = owner[0], converting["job"]
    item_id = converting["item"]["id"]
    reports = converted_files(cloud, job)

    done = complete(db, job, reports)

    assert (done.status, done.credit_state, done.progress, done.renderer) == ("completed", "none", 1.0, RENDERER)
    [scene] = _scenes(db)
    assert (scene.user_id, scene.name, scene.sku, scene.category, scene.note) == (user.id, "Solitaire", "R-1001", "Ring", "1 ct")
    assert scene.model_key.startswith(f"customers/{user.id}/models/") and scene.model_key.endswith("-R-1001.glb")
    assert cloud.objects[scene.model_key] == REAL_GLB
    assert cloud.objects[scene.thumbnail_key] == THUMBNAIL
    assert [(slot["slotId"], slot.get("role")) for slot in scene.model_config["slots"]] == [("Metal 1", "metal"), ("Gem 1", "gem")]
    assert scene.slot_selections == {"Metal 1": "gold-18k-yellow", "Gem 1": "diamond"}
    # Published under its SKU, as a direct upload with a SKU is.
    assert scene.published_at is not None
    assert cloud.objects[f"published/{user.id}/R-1001/model.glb"] == REAL_GLB
    item = item_row(db, item_id)
    assert (item.status, item.scene_id, item.error) == ("done", scene.id, None)
    # The triangles the API counted in the GLB, not the converter's own count.
    assert (item.polygon_count, item.size_mm, item.warnings) == (REAL_GLB_TRIANGLES, 21.0, ["Layer 'Notes' was skipped."])
    assert (item.model_credit_held, item.render_credits_held) == (0, 0)
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1])  # the held credit was spent, not taken again
    assert _storage_used(db, user) == len(REAL_GLB) + len(THUMBNAIL)
    assert cloud.under(f"customers/{user.id}/renders/{job.id}/") == []  # the job's copies are gone
    batch = batch_row(db, converting["batch"]["id"])
    assert (batch.status, batch.expires_at) == ("completed", batch.finished_at + timedelta(days=30))


def test_a_second_complete_is_409_and_makes_no_second_scene(db, owner, cloud, converting):
    job = converting["job"]
    reports = converted_files(cloud, job)
    complete(db, job, reports)
    converted_files(cloud, job)

    assert _error(lambda: complete(db, job, reports)).status_code == 409
    assert len(_scenes(db)) == 1
    assert balances(db, owner[0]) == (STUDIO[0] - 1, STUDIO[1])


@pytest.mark.parametrize(
    ("model", "status"),
    [
        (RENAMED_FILES["step"], 415),
        (RENAMED_FILES["obj"], 415),
        (RENAMED_FILES["gltf-json"], 415),
        (TRUNCATED_GLB, 422),
        (REAL_GLB + RENAMED_FILES["step"], 422),
        (glb(mesh_doc(300, mode=1)), 422),  # lines only: nothing to show
    ],
    ids=["step", "obj", "gltf-json", "truncated", "trailing-bytes", "no-triangles"],
)
def test_the_glb_checks_of_a_direct_upload_refuse_bad_output(db, owner, cloud, converting, model, status):
    user, job = owner[0], converting["job"]
    reports = converted_files(cloud, job, model=model)

    error = _error(lambda: complete(db, job, reports))

    assert error.status_code == status
    assert error.detail.endswith("The design has ended and its credits were refunded.")
    db.refresh(job)
    assert (job.status, job.error_code) == ("failed", "model_unreadable")
    item = item_row(db, converting["item"]["id"])
    assert (item.status, item.error_code, item.scene_id) == ("failed", "model_unreadable", None)
    assert _scenes(db) == []
    assert balances(db, user) == STUDIO
    assert _storage_used(db, user) == 0
    assert cloud.under(f"customers/{user.id}/models/") == cloud.under(f"customers/{user.id}/renders/") == []
    assert batch_row(db, converting["batch"]["id"]).status == "completed_with_errors"


def test_a_model_over_the_plans_polygon_cap_fails_its_design(client, db, cloud):
    user, headers = sign_in(db, "grow@example.com", tier="grow")  # 500,000 triangles
    batch = submitted_batch(client, headers, cloud)
    job = claim(db)
    assert job.spec["max_polygons"] == 500_000

    error = _error(lambda: complete(db, job, converted_files(cloud, job, model=glb_with_triangles(500_001))))

    assert error.status_code == 402
    item = item_row(db, batch["items"][0]["id"])
    assert (item.status, item.error_code) == ("failed", "over_polygon_cap")
    assert item.error.startswith("Polygon limit exceeded for Grow")
    assert (_scenes(db), balances(db, user)) == ([], (75, 300))


def test_a_full_storage_fails_the_design(db, owner, cloud, converting):
    from app.features.billing.plans import get_quotas

    user, job = owner[0], converting["job"]
    billing = get_or_create_billing(db, user)
    billing.storage_bytes_used = get_quotas("studio").storage_bytes - 10
    db.commit()

    error = _error(lambda: complete(db, job, converted_files(cloud, job)))

    assert error.status_code == 402
    assert item_row(db, converting["item"]["id"]).error_code == "over_limit"
    assert (_scenes(db), balances(db, user)) == ([], STUDIO)


def test_a_sku_a_plain_upload_took_meanwhile_fails_the_design(db, owner, other, cloud, converting):
    """The index closes the race between a plain upload's check and a batch's reservation."""
    job = converting["job"]
    now = datetime.utcnow()
    db.add(Scene(user_id=other[0].id, model_key="customers/2/models/x.glb", sku="R-1001", created_at=now, updated_at=now))
    db.commit()

    error = _error(lambda: complete(db, job, converted_files(cloud, job)))

    assert error.status_code == 409
    item = item_row(db, converting["item"]["id"])
    assert (item.status, item.error_code) == ("failed", "sku_taken")
    assert len(_scenes(db)) == 1
    assert balances(db, owner[0]) == STUDIO


def test_a_sku_taken_between_the_check_and_the_save_fails_the_design(db, owner, other, cloud, converting, monkeypatch):
    job = converting["job"]
    now = datetime.utcnow()
    db.add(Scene(user_id=other[0].id, model_key="customers/2/models/x.glb", sku="R-1001", created_at=now, updated_at=now))
    db.commit()
    monkeypatch.setattr(conversions, "assert_sku_available", lambda *args, **kwargs: None)

    error = _error(lambda: complete(db, job, converted_files(cloud, job)))

    assert (error.status_code, item_row(db, converting["item"]["id"]).error_code) == (409, "sku_taken")
    assert cloud.under(f"customers/{owner[0].id}/models/") == []  # the written copy is taken away again


@pytest.mark.parametrize(
    ("report", "detail"),
    [
        (b"{not json", "conversion.json"),
        (conversion_report(colour="red"), "conversion.json.colour"),
        (conversion_report(polygon_count="680"), "conversion.json.polygon_count"),
        (conversion_report(units={"mm_per_unit": 1.0, "source": "guessed", "size_mm": [1, 2, 3]}), "conversion.json.units.source"),
        (conversion_report(units={"mm_per_unit": 1.0, "source": "declared", "size_mm": [1, 2]}), "conversion.json.units.size_mm"),
        (conversion_report(roles={"Pave 1": "gem"}), "conversion.json: roles names slots"),
        (conversion_report(slot_selections={"Metal 1": "catalog:gold"}), "conversion.json.slot_selections.Metal 1"),
        (conversion_report(warnings=["w" * 501]), "conversion.json.warnings[0]"),
    ],
)
def test_a_conversion_report_that_isnt_one_is_400_and_the_job_keeps_running(db, owner, cloud, converting, report, detail):
    job = converting["job"]

    error = _error(lambda: complete(db, job, converted_files(cloud, job, report=report)))

    assert error.status_code == 400
    assert error.detail.startswith(detail)
    db.refresh(job)
    assert (job.status, item_row(db, converting["item"]["id"]).status) == ("running", "converting")
    assert (_scenes(db), balances(db, owner[0])) == ([], (STUDIO[0] - 1, STUDIO[1]))


def test_a_conversion_without_a_thumbnail_makes_a_scene_without_one(db, cloud, converting):
    job = converting["job"]

    complete(db, job, converted_files(cloud, job, thumbnail=None))

    [scene] = _scenes(db)
    assert scene.thumbnail_key is None


def test_a_bad_thumbnail_is_dropped_and_the_scene_made_without_it(db, cloud, converting):
    job = converting["job"]

    complete(db, job, converted_files(cloud, job, thumbnail=b"RIFF\x10\x00\x00\x00WEBPVP8 "))

    assert _scenes(db)[0].thumbnail_key is None


def test_complete_needs_the_model_and_the_report(db, cloud, converting):
    job = converting["job"]
    reports = converted_files(cloud, job)

    error = _error(lambda: complete(db, job, [report for report in reports if report["name"] != "model.glb"]))
    twice = _error(lambda: complete(db, job, [*reports, reports[2]]))

    assert error.status_code == twice.status_code == 400
    assert error.detail == "outputs: the job makes model.glb, conversion.json, each once, and may make thumbnail.webp"


def test_a_design_with_a_render_plan_is_converted_and_keeps_its_render_credits_held(client, db, owner, cloud):
    user, headers = owner
    batch = submitted_batch(client, headers, cloud, batch_body(render_plan=STILLS_PLAN))
    job = claim(db)

    complete(db, job, converted_files(cloud, job))

    item = item_row(db, batch["items"][0]["id"])
    assert (item.status, item.model_credit_held, item.render_credits_held) == ("converted", 0, 4)
    assert batch_row(db, batch["id"]).status == "processing"  # its renders come next (F2)
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - 4)


def test_a_batch_settles_once_its_last_design_finishes(client, db, owner, cloud):
    batch = submitted_batch(client, owner[1], cloud, batch_body(*designs(3)))
    first, second, third = claim(db), claim(db), claim(db)

    complete(db, first, converted_files(cloud, first))
    fail(db, second, "model_unreadable")
    assert batch_row(db, batch["id"]).status == "processing"
    complete(db, third, converted_files(cloud, third))

    row = batch_row(db, batch["id"])
    assert (row.status, row.finished_at is not None) == ("completed_with_errors", True)
    assert client.get(f"/ingest/batches/{batch['id']}", headers=owner[1]).json()["counts"] == {"done": 2, "failed": 1}


# ---------------------------------------------------------------------------
# A job ending otherwise ends its design
# ---------------------------------------------------------------------------


def test_a_design_canceled_while_its_job_runs_makes_no_scene(client, db, owner, cloud, converting):
    job = converting["job"]
    reports = converted_files(cloud, job)
    client.post(f"/ingest/batches/{converting['batch']['id']}/cancel", headers=owner[1])

    error = _error(lambda: complete(db, job, reports))

    assert error.status_code == 409
    db.refresh(job)
    assert (job.status, job.error_code) == ("canceled", "canceled")
    assert item_row(db, converting["item"]["id"]).status == "canceled"
    assert _scenes(db) == []
    assert cloud.under(f"customers/{owner[0].id}/renders/") == []
    assert balances(db, owner[0]) == STUDIO


def test_a_lease_that_lapses_on_the_last_attempt_fails_the_design(db, owner, converting, monkeypatch):
    class Clock:
        now = datetime.utcnow()

        @classmethod
        def utcnow(cls):
            return cls.now

    monkeypatch.setattr(worker, "datetime", Clock)
    job = converting["job"]
    for _ in range(3):
        Clock.now += timedelta(seconds=200)
        worker.take_back_lapsed_leases(db, Clock.now)
        db.refresh(job)
        if job.status == "queued":
            job.run_after = None
            db.commit()
            claim(db)

    item = item_row(db, converting["item"]["id"])
    assert (job.status, item.status, item.error_code) == ("failed", "failed", "lease_expired")
    assert balances(db, owner[0]) == STUDIO


def test_a_worker_can_fail_a_design_over_the_polygon_cap(db, owner, converting):
    """The converter's own check: stones alone over the cap, or decimate "fail"."""
    job = converting["job"]

    failed = worker.fail_job(db, job.id, job.worker_token, error="stones alone are 2.4M triangles", code="over_polygon_cap", retryable=True)

    assert (failed.status, failed.error_code) == ("failed", "over_polygon_cap")
    item = item_row(db, converting["item"]["id"])
    assert (item.status, item.error_code, item.error) == ("failed", "over_polygon_cap", "stones alone are 2.4M triangles")


def test_canceling_a_queued_convert_job_cancels_its_design(client, db, owner, cloud):
    user, headers = owner
    batch = submitted_batch(client, headers, cloud)
    job_id = item_row(db, batch["items"][0]["id"]).convert_job_id

    canceled = cancel_job(db, user, job_id)

    item = item_row(db, batch["items"][0]["id"])
    assert (canceled.status, item.status, item.error_code) == ("canceled", "canceled", "canceled")
    assert balances(db, user) == STUDIO
    assert batch_row(db, batch["id"]).status == "completed_with_errors"


# ---------------------------------------------------------------------------
# Over HTTP, from the drop to the scene
# ---------------------------------------------------------------------------


def test_a_design_goes_from_its_cad_file_to_a_published_scene_over_http(client, db, owner, cloud):
    user, headers = owner
    settings = get_settings().model_copy(update={"render_worker_token": "worker-secret"})
    app.dependency_overrides[get_settings] = lambda: settings
    batch = submitted_batch(client, headers, cloud, batch_body(design("rings/R-9.3dm", 5_000, sku="R-9")))

    claimed = client.post("/render-jobs/claim", headers={"X-Worker-Token": "worker-secret"}, json={"worker_id": "cpu-a-1", "kinds": ["convert"]}).json()
    token = {"X-Job-Token": claimed["job_token"]}
    payload = client.get(f"/render-jobs/{claimed['job_id']}/payload", headers=token).json()
    files = [("model.glb", "model/gltf-binary", REAL_GLB), ("thumbnail.webp", "image/webp", THUMBNAIL), ("conversion.json", "application/json", json.dumps(conversion_report()).encode())]
    signed = client.post(
        f"/render-jobs/{claimed['job_id']}/uploads", headers=token,
        json={"files": [{"name": name, "content_type": kind, "bytes": len(data)} for name, kind, data in files]},
    ).json()["files"]
    for upload, (_, _, data) in zip(signed, files, strict=True):
        cloud.objects[upload["key"]] = data
    done = client.post(
        f"/render-jobs/{claimed['job_id']}/complete", headers=token,
        json={
            "outputs": [
                {"name": name, "key": upload["key"], "content_type": kind, "bytes": len(data),
                 "width": 512 if name == "thumbnail.webp" else None, "height": 512 if name == "thumbnail.webp" else None}
                for upload, (name, kind, data) in zip(signed, files, strict=True)
            ],
            "renderer": RENDERER,
        },
    )

    assert (claimed["kind"], payload["kind"], payload["source"]["url"].endswith("R-9.3dm?get&expires=900")) == ("convert", "convert", True)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "completed"
    finished = client.get(f"/ingest/batches/{batch['id']}", headers=headers).json()
    item = client.get(f"/ingest/batches/{batch['id']}/items", headers=headers).json()["items"][0]
    assert (finished["status"], finished["counts"], item["status"]) == ("completed", {"done": 1}, "done")
    scene = client.get(f"/scenes/{item['scene_id']}", headers=headers).json()
    assert (scene["sku"], scene["name"]) == ("R-9", "R-9")
    assert client.get("/scenes/by-sku/R-9").status_code == 200
