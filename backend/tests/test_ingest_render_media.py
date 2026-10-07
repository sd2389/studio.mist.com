"""What a batch design's completed render jobs leave besides their renders (docs/adr/0006-bulk-pipeline.md,
"Render plans"): the scene's thumbnail from the plan's front still, its outputs copied beside its
published model only when the plan publishes media, and the embed link its design keeps."""

from io import BytesIO

from ingest_samples import THUMBNAIL, batch_body, client, cloud, design, owner, submitted_batch  # noqa: F401 - fixtures
from PIL import Image
from render_samples import ANGLES, DEFAULT_PLAN, STILL, batch_outputs, convert_all, gpu, planned_batch, scene_of  # noqa: F401

from app.config import get_settings
from app.features.billing.quota_service import get_or_create_billing


def _image_size(data: bytes) -> tuple[str, tuple[int, int]]:
    with Image.open(BytesIO(data)) as image:
        return image.format, image.size


def test_the_scenes_thumbnail_becomes_a_512_px_webp_of_the_front_still(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud)
    convert_all(db, cloud)
    item_id = batch["items"][0]["id"]
    converted_thumbnail = scene_of(db, item_id).thumbnail_key
    storage_before = get_or_create_billing(db, user).storage_bytes_used

    gpu.complete(gpu.claim_kind("angle_set"))

    db.expire_all()
    scene = scene_of(db, item_id)
    assert scene.thumbnail_key != converted_thumbnail
    assert scene.thumbnail_key.startswith(f"customers/{user.id}/thumbnails/")
    assert _image_size(cloud.objects[scene.thumbnail_key]) == ("WEBP", (512, 512))
    assert converted_thumbnail not in cloud.objects  # the converter's is freed
    assert cloud.objects[f"published/{user.id}/R-1/thumbnail.webp"] == cloud.objects[scene.thumbnail_key]
    stills = len(STILL) * len(ANGLES)
    assert get_or_create_billing(db, user).storage_bytes_used == (
        storage_before + stills - len(THUMBNAIL) + len(cloud.objects[scene.thumbnail_key])
    )


def test_without_thumbnail_from_the_converters_thumbnail_stays(client, db, owner, cloud, gpu):
    batch = planned_batch(client, owner[1], cloud, plan={**DEFAULT_PLAN, "thumbnail_from": None})
    convert_all(db, cloud)
    item_id = batch["items"][0]["id"]
    converted_thumbnail = scene_of(db, item_id).thumbnail_key

    gpu.run_all()

    db.expire_all()
    assert scene_of(db, item_id).thumbnail_key == converted_thumbnail


def test_a_still_that_cant_be_read_leaves_the_thumbnail_and_the_completed_job_as_they_are(client, db, owner, cloud, gpu, monkeypatch):
    from render_samples import FakeGpuWorker

    batch = planned_batch(client, owner[1], cloud)
    convert_all(db, cloud)
    item_id = batch["items"][0]["id"]
    converted_thumbnail = scene_of(db, item_id).thumbnail_key
    monkeypatch.setattr("render_samples.STILL", b"\xff\xd8\xff not a JPEG")

    job = FakeGpuWorker(db, cloud).complete(gpu.claim_kind("angle_set"))

    db.expire_all()
    assert (job.status, job.credit_state) == ("completed", "charged")
    assert scene_of(db, item_id).thumbnail_key == converted_thumbnail


def test_outputs_stay_private_unless_the_plan_publishes_media(client, db, owner, cloud, gpu):
    batch = planned_batch(client, owner[1], cloud)
    convert_all(db, cloud)

    gpu.run_all()

    assert {output.public_key for output in batch_outputs(db, batch["id"])} == {None}
    assert [key for key in cloud.objects if "/media/" in key] == []


def test_publish_media_copies_each_output_beside_the_published_model(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, plan={**DEFAULT_PLAN, "publish_media": True})
    convert_all(db, cloud)

    gpu.run_all()

    outputs = batch_outputs(db, batch["id"])
    assert len(outputs) == len(ANGLES) + 1
    assert {output.public_key for output in outputs} == {
        f"published/{user.id}/R-1/media/{output.job_id}/{output.filename}" for output in outputs
    }
    for output in outputs:
        assert cloud.objects[output.public_key] == cloud.objects[output.key]
    # Deleting the scene takes its public media with it.
    assert client.delete(f"/scenes/{scene_of(db, batch['items'][0]['id']).id}", headers=headers).status_code == 200
    assert [key for key in cloud.objects if "/media/" in key] == []


def test_a_design_keeps_its_embed_link_from_the_moment_its_scene_is_made(client, db, owner, cloud):
    batch = submitted_batch(client, owner[1], cloud, batch_body(design("rings/R-1001.stl", 900, sku="R-1001"), render_plan=DEFAULT_PLAN))
    convert_all(db, cloud)

    item = client.get(f"/ingest/batches/{batch['id']}/items", headers=owner[1]).json()["items"][0]

    assert item["embed_url"] == f"{get_settings().app_public_url.rstrip('/')}/embed/R-1001"
    assert client.get("/scenes/by-sku/R-1001").status_code == 200  # what the embed page reads
    assert cloud.objects[f"published/{owner[0].id}/R-1001/model.glb"]  # and the model it shows


def test_a_done_design_whose_scene_failed_to_publish_is_published_again(client, db, owner, cloud, gpu):
    batch = planned_batch(client, owner[1], cloud, plan={**DEFAULT_PLAN, "thumbnail_from": None})
    convert_all(db, cloud)
    scene = scene_of(db, batch["items"][0]["id"])
    scene.published_at = None  # as a publish that failed leaves it
    db.commit()

    gpu.run_all()

    db.expire_all()
    assert scene_of(db, batch["items"][0]["id"]).published_at is not None


def test_the_batch_page_shows_each_designs_published_thumbnail(client, db, owner, cloud, monkeypatch):
    batch = planned_batch(client, owner[1], cloud)
    convert_all(db, cloud)
    monkeypatch.setenv("R2_PUBLIC_BASE_URL", "https://pub.example.com")
    get_settings.cache_clear()
    try:
        listed = client.get(f"/ingest/batches/{batch['id']}/items", headers=owner[1]).json()["items"][0]
    finally:
        get_settings.cache_clear()

    assert listed["thumbnail_url"] == f"https://pub.example.com/published/{owner[0].id}/R-1/thumbnail.webp"
