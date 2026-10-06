"""The render job endpoints for users, over HTTP: create (with Idempotency-Key), bulk, quote,
list, get, cancel and download (docs/adr/0005-server-exports.md). Creating and quoting need the
server_exports flag, which these tests turn on."""

from datetime import datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from pack_samples import DEFAULT_PACK, pack

from app.core import storage as storage_mod
from app.core.public_urls import public_file_url
from app.core.storage.local import LocalBackend
from app.features.billing.quota_service import get_or_create_billing, reset_allotments
from app.main import app
from app.models import FeatureFlag, Render, RenderJob, Scene, User, UserAsset
from app.models.user import Session as DbSession

VIEW = {"view": {"position": [0.62, 0.88, 2.25], "target": [0, 0, 0]}}
FOUR_K = {"camera": VIEW, "width": 3840, "height": 2160}  # 2 credits
EIGHT_K = {"camera": VIEW, "width": 7680, "height": 4320}  # 4 credits
TURNTABLE = {"width": 1920, "height": 1080, "fps": 30, "frames": 120, "path": {"orbit": {"start": VIEW}}}  # 3 credits
SPIN = {"frames": 72, "size": 1080, "format": "jpeg"}  # 2 credits


def _sign_in(db, email: str, tier: str = "free") -> tuple[User, dict[str, str]]:
    now = datetime.utcnow()
    user = User(email=email, password_hash="hash", role="user", created_at=now, updated_at=now)
    db.add(user)
    db.commit()
    reset_allotments(db, get_or_create_billing(db, user), tier)
    db.add(DbSession(token=f"session-{user.id}", user_id=user.id, expires_at=now + timedelta(days=1)))
    db.commit()
    return user, {"Authorization": f"Bearer session-{user.id}"}


def _balance(db, user: User) -> int:
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return billing.render_credits_balance


def _job_rows(db) -> list[RenderJob]:
    db.expire_all()
    return db.query(RenderJob).order_by(RenderJob.id).all()


def _set_server_exports(db, enabled: bool) -> None:
    db.merge(FeatureFlag(key="server_exports", enabled=enabled, updated_at=datetime.utcnow()))
    db.commit()


@pytest.fixture()
def client(db, tmp_path, monkeypatch):
    from app.database import get_db

    def _override_db():
        yield db

    monkeypatch.setattr(storage_mod, "get_storage", lambda: LocalBackend(tmp_path))
    _set_server_exports(db, True)
    app.dependency_overrides[get_db] = _override_db
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def owner(db):
    return _sign_in(db, "owner@example.com")


@pytest.fixture()
def other(db):
    return _sign_in(db, "other@example.com")


@pytest.fixture()
def scene(db, owner) -> Scene:
    now = datetime.utcnow()
    row = Scene(
        user_id=owner[0].id,
        model_key="customers/1/models/ring.glb",
        name="Solitaire ring",
        sku="RING-1",
        material="platinum",
        lighting="soft",
        model_config={"slots": [{"slotId": "Metal 1"}, {"slotId": "Gem 1"}]},
        slot_selections={"Metal 1": "platinum"},
        scene_settings={"finish": "brushed", "poses": [{"id": "pose-hero", "name": "Hero", "cameraPosition": [1, 1, 1], "target": [0, 0, 0]}]},
        variants={
            "items": [
                {
                    "id": "v-rose",
                    "name": "Rose",
                    "snapshot": {"material": "gold-18k-rose", "lighting": "dramatic", "slotSelections": {"Metal 1": "gold-18k-rose"}, "sceneSettings": {}},
                }
            ]
        },
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    return row


def _create(client, headers, scene, spec=FOUR_K, **body):
    return client.post("/render-jobs", headers=headers, json={"kind": "still", "scene_id": scene.id, "spec": spec, **body})


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def test_create_queues_a_still_and_holds_its_price(client, db, owner, scene):
    user, headers = owner

    res = _create(client, headers, scene, name="Solitaire 4K")

    assert res.status_code == 201
    job = res.json()
    assert (job["kind"], job["status"], job["scene_id"]) == ("still", "queued", scene.id)
    assert (job["credits"], job["credit_state"], job["watermark"]) == (2, "held", True)
    assert job["spec"]["output_names"] == ["Solitaire-4K.png"]
    assert job["spec"]["frames"] == 1
    assert job["outputs"] == []
    assert _balance(db, user) == 23
    row = _job_rows(db)[0]
    assert (row.priority, row.max_running, row.max_attempts) == (100, 1, 3)
    assert (row.look["material"], row.look["lighting"]) == ("platinum", "soft")


def test_a_free_8k_still_is_402(client, db, owner, scene):
    user, headers = owner

    res = _create(client, headers, scene, spec=EIGHT_K)

    assert res.status_code == 402
    assert "Resolution limit exceeded for Free" in res.json()["detail"]
    assert _job_rows(db) == []
    assert _balance(db, user) == 25


def test_a_grow_8k_still_is_queued_without_the_mark(client, db, scene):
    user, headers = _sign_in(db, "grower@example.com", tier="grow")
    scene.user_id = user.id
    db.commit()

    res = _create(client, headers, scene, spec=EIGHT_K)

    assert res.status_code == 201
    assert (res.json()["credits"], res.json()["watermark"]) == (4, False)
    assert _balance(db, user) == 296


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({"spec": {**FOUR_K, "width": 10}}, "spec.width:"),
        ({"spec": {**FOUR_K, "fps": 30}}, "spec.fps:"),
        ({"kind": "convert", "spec": {}}, "kind: 'convert' is not available yet"),
        ({"look": {"material": "platinum", "lighting": "neon"}}, "look.lighting:"),
        ({"spec": {**FOUR_K, "camera": {"pose": "pose-nowhere"}}}, "spec.camera.pose: the look has no pose"),
        ({"kind": "turntable", "spec": {**TURNTABLE, "width": 1919}}, "spec.width: must be even"),
        ({"kind": "turntable", "spec": {**TURNTABLE, "quality": "ultra"}}, "spec.quality:"),
        ({"kind": "turntable", "spec": {**TURNTABLE, "path": {"poses": ["pose-nowhere"]}}}, "spec.path.poses[0]: the look"),
        ({"kind": "spin", "spec": {**SPIN, "frames": 145}}, "spec.frames:"),
    ],
)
def test_a_bad_spec_or_look_is_400_naming_the_field(client, db, owner, scene, body, detail):
    user, headers = owner

    res = client.post("/render-jobs", headers=headers, json={"kind": "still", "scene_id": scene.id, "spec": FOUR_K, **body})

    assert res.status_code == 400
    assert res.json()["detail"].startswith(detail)
    assert _balance(db, user) == 25


def test_creating_and_quoting_are_404_while_server_exports_is_off(client, db, owner, scene):
    user, headers = owner
    job_id = _create(client, headers, scene).json()["id"]
    _set_server_exports(db, False)
    body = {"kind": "still", "scene_id": scene.id, "spec": FOUR_K}

    created = client.post("/render-jobs", headers=headers, json=body)
    bulk = client.post("/render-jobs/bulk", headers=headers, json={"jobs": [body]})
    quote = client.post("/render-jobs/quote", headers=headers, json=body)
    bulk_quote = client.post("/render-jobs/bulk/quote", headers=headers, json={"jobs": [body]})
    signed_out = client.post("/render-jobs", json=body)

    assert [res.status_code for res in (created, bulk, quote, bulk_quote, signed_out)] == [404] * 5
    assert len(_job_rows(db)) == 1
    # A job made before stays its owner's to read and cancel.
    assert client.get(f"/render-jobs/{job_id}", headers=headers).status_code == 200
    assert client.post(f"/render-jobs/{job_id}/cancel", headers=headers).status_code == 200


def test_server_exports_is_off_until_an_admin_turns_it_on(client, db, owner, scene):
    db.query(FeatureFlag).delete()
    db.commit()

    assert _create(client, owner[1], scene).status_code == 404


def test_another_users_scene_is_404(client, db, other, scene):
    assert _create(client, other[1], scene).status_code == 404
    assert _job_rows(db) == []


def test_the_look_comes_from_the_request_else_the_variant_else_the_scene(client, db, owner, scene):
    headers = owner[1]
    look = {
        "material": "gold-18k-white",
        "lighting": "catalog",
        "slot_selections": {"Metal 1": "gold-18k-white"},
        "scene_settings": {"finish": "polished"},
        "model_config": {"slots": [{"slotId": "Metal 1"}]},
    }

    sent = _create(client, headers, scene, look=look)
    variant = _create(client, headers, scene, variant_id="v-rose")
    saved = _create(client, headers, scene)
    missing = _create(client, headers, scene, variant_id="v-gone")

    assert [res.status_code for res in (sent, variant, saved, missing)] == [201, 201, 201, 404]
    looks = [row.look for row in _job_rows(db)]
    assert looks[0] == look
    assert (looks[1]["material"], looks[1]["lighting"], looks[1]["scene_settings"]["finish"]) == ("gold-18k-rose", "dramatic", "brushed")
    assert (looks[2]["material"], looks[2]["lighting"]) == ("platinum", "soft")


def test_a_saved_background_image_of_the_owner_is_kept_by_id(client, db, owner, scene):
    """The studio saves an uploaded backdrop as its link; the job keeps the asset, not the address."""
    key = f"customers/{owner[0].id}/assets/background/abc123def456.png"
    asset = UserAsset(user_id=owner[0].id, asset_type="background", label="Backdrop", storage_key=key, preview_key=key)
    db.add(asset)
    db.commit()
    scene.scene_settings = {**scene.scene_settings, "customBackground": public_file_url(key)}
    db.commit()

    res = _create(client, owner[1], scene)

    assert res.status_code == 201
    assert _job_rows(db)[0].look["scene_settings"]["customBackground"] == {"type": "image", "asset_id": asset.id}
    # The job answers the look it keeps: never the image's address.
    assert res.json()["look"]["scene_settings"]["customBackground"] == {"type": "image", "asset_id": asset.id}


def test_a_job_answers_what_its_request_asked_for_so_it_can_be_asked_for_again(client, db, owner, scene):
    headers = owner[1]
    first = _create(client, headers, scene, name="Rose 4K", variant_id="v-rose").json()
    assert (first["name"], first["variant_id"], first["look"]["material"]) == ("Rose 4K", "v-rose", "gold-18k-rose")

    # A Retry: the same request, from what the job answers. The API adds frames and output_names.
    spec = {key: value for key, value in first["spec"].items() if key not in ("frames", "output_names")}
    request = {key: first[key] for key in ("kind", "scene_id", "variant_id", "look", "name")}
    again = client.post("/render-jobs", headers=headers, json={**request, "spec": spec})

    assert again.status_code == 201
    retried = again.json()
    assert retried["id"] != first["id"]
    assert [retried[key] for key in ("spec", "look", "name", "variant_id", "credits")] == [
        first[key] for key in ("spec", "look", "name", "variant_id", "credits")
    ]


def test_the_queue_is_capped_by_the_plan(client, db, owner, scene):
    user, headers = owner
    for _ in range(5):
        assert _create(client, headers, scene, spec={**FOUR_K, "width": 1024, "height": 1024}).status_code == 201

    res = _create(client, headers, scene, spec={**FOUR_K, "width": 1024, "height": 1024})

    assert res.status_code == 429
    assert "Render queue full" in res.json()["detail"]
    assert _balance(db, user) == 20


# ---------------------------------------------------------------------------
# Turntables and spins
# ---------------------------------------------------------------------------


def test_a_turntable_is_queued_with_its_own_frame_count_and_one_mp4(client, db, owner, scene):
    user, headers = owner

    res = _create(client, headers, scene, kind="turntable", spec=TURNTABLE)

    assert res.status_code == 201
    job = res.json()
    assert (job["kind"], job["credits"], job["credit_state"], job["watermark"]) == ("turntable", 3, "held", True)
    assert job["spec"] == {**TURNTABLE, "quality": "high", "output_names": ["RING-1.mp4"]}
    assert _balance(db, user) == 22


def test_a_spin_is_queued_with_its_own_frame_count_and_one_zip(client, db, owner, scene):
    user, headers = owner

    res = _create(client, headers, scene, kind="spin", spec=SPIN)

    assert res.status_code == 201
    job = res.json()
    assert (job["kind"], job["credits"]) == ("spin", 2)
    assert job["spec"] == {**SPIN, "jpeg_quality": 0.95, "transparent": False, "output_names": ["RING-1-spin.zip"]}
    assert _balance(db, user) == 23


@pytest.mark.parametrize(
    ("kind", "spec", "detail"),
    [
        ("turntable", {**TURNTABLE, "fps": 60, "frames": 240}, "Frame rate limit exceeded for Free (max 30 fps)."),
        ("turntable", {**TURNTABLE, "frames": 601}, "Video length limit exceeded for Free (max 20 s)."),
        ("turntable", {**TURNTABLE, "width": 7680, "height": 4320}, "Resolution limit exceeded for Free"),
        ("turntable", {**TURNTABLE, "width": 4096, "height": 2160}, "8K video (above 8.3 megapixels a frame)"),
        ("spin", {**SPIN, "frames": 144}, "Spin frame limit exceeded for Free (max 72 frames)."),
        ("spin", {**SPIN, "size": 2048}, "Spin size limit exceeded for Free (max 1080 px)."),
    ],
)
def test_a_free_video_or_spin_past_the_plan_is_402_and_holds_nothing(client, db, owner, scene, kind, spec, detail):
    user, headers = owner

    res = _create(client, headers, scene, kind=kind, spec=spec)

    assert res.status_code == 402
    assert res.json()["detail"].startswith(detail)
    assert _job_rows(db) == []
    assert _balance(db, user) == 25


def test_grow_renders_a_minute_at_60_fps_8k_for_20_seconds_and_bigger_spins(client, db, grower, scene):
    user, headers = grower
    eight_k = {**TURNTABLE, "width": 7680, "height": 4320}

    minute = _create(client, headers, scene, kind="turntable", spec={**TURNTABLE, "fps": 60, "frames": 3600})
    short_8k = _create(client, headers, scene, kind="turntable", spec={**eight_k, "frames": 600})
    long_8k = _create(client, headers, scene, kind="turntable", spec={**eight_k, "frames": 601})
    spin = _create(client, headers, scene, kind="spin", spec={**SPIN, "frames": 144, "size": 2048})

    assert [res.status_code for res in (minute, short_8k, long_8k, spin)] == [201, 201, 402, 201]
    assert long_8k.json()["detail"] == "Video length limit exceeded for Grow (max 20 s at 8K)."
    # 6 started 10 s at 1080p, doubled at 60 fps; 2 started 10 s at 8K; a 144-frame spin at 2048 px.
    assert [minute.json()["credits"], short_8k.json()["credits"], spin.json()["credits"]] == [36, 40, 8]
    assert _balance(db, user) == 300 - 36 - 40 - 8
    assert [row.watermark for row in _job_rows(db)] == [False, False, False]


def test_a_turntable_is_asked_for_again_with_its_own_frame_count(client, db, owner, scene):
    """A Retry sends the spec back less output_names: a turntable's frames are its own."""
    headers = owner[1]
    first = _create(client, headers, scene, kind="turntable", spec=TURNTABLE).json()

    spec = {key: value for key, value in first["spec"].items() if key != "output_names"}
    again = _create(client, headers, scene, kind="turntable", spec=spec)

    assert again.status_code == 201
    assert (again.json()["spec"], again.json()["credits"]) == (first["spec"], first["credits"])


# ---------------------------------------------------------------------------
# Campaign Packs
# ---------------------------------------------------------------------------


def test_a_free_campaign_pack_is_402_and_holds_nothing(client, db, owner, scene):
    user, headers = owner

    res = _create(client, headers, scene, kind="campaign_pack", spec=DEFAULT_PACK)

    assert res.status_code == 402
    assert res.json()["detail"] == "The Campaign Pack is part of Grow and Studio, not Free."
    assert (_job_rows(db), _balance(db, user)) == ([], 25)


def test_a_grow_campaign_pack_is_queued_at_the_sum_of_its_parts_as_one_zip(client, db, grower, scene):
    user, headers = grower

    default = _create(client, headers, scene, kind="campaign_pack", spec=DEFAULT_PACK)
    with_a_pose = _create(client, headers, scene, kind="campaign_pack", spec=pack(angleIds=["front", "pose:pose-hero"]))

    assert (default.status_code, with_a_pose.status_code) == (201, 201)
    job = default.json()
    assert (job["kind"], job["credits"], job["credit_state"], job["watermark"]) == ("campaign_pack", 49, "held", False)
    assert job["spec"] == {**DEFAULT_PACK, "frames": 2041, "output_names": ["RING-1_campaign-pack.zip"]}
    # 3 metals × 2 angles × JPG and PNG, six turntables, three spins and the ASET image.
    assert with_a_pose.json()["credits"] == 12 + 18 + 6 + 1
    assert _balance(db, user) == 300 - 49 - 37


def test_a_campaign_packs_quote_is_49_and_free_is_told_why_not(client, db, owner, grower, scene):
    body = {"kind": "campaign_pack", "scene_id": scene.id, "spec": DEFAULT_PACK}

    quote = client.post("/render-jobs/quote", headers=grower[1], json=body)
    bulk = _bulk_quote(client, grower[1], scene, {"kind": "campaign_pack", "spec": DEFAULT_PACK}, {})
    free = client.post("/render-jobs/quote", headers=owner[1], json=body)

    assert quote.status_code == 200
    assert {field: quote.json()[field] for field in ("credits", "width", "height", "frames", "outputs")} == {
        "credits": 49, "width": 2000, "height": 2000, "frames": 2041, "outputs": ["RING-1_campaign-pack.zip"],
    }
    assert (bulk.json()["credits"], bulk.json()["refused"]) == (49 + 2, None)
    assert (free.status_code, free.json()["detail"]) == (402, "The Campaign Pack is part of Grow and Studio, not Free.")
    assert _job_rows(db) == []


def test_a_campaign_pack_is_asked_for_again_less_what_the_api_added(client, db, grower, scene):
    headers = grower[1]
    first = _create(client, headers, scene, kind="campaign_pack", spec=pack(background={"kind": "custom", "color": "#f4f2ee"}))

    spec = {key: value for key, value in first.json()["spec"].items() if key not in ("frames", "output_names")}
    again = _create(client, headers, scene, kind="campaign_pack", spec=spec)

    assert (first.status_code, again.status_code) == (201, 201)
    assert again.json()["spec"] == first.json()["spec"]


@pytest.mark.parametrize(
    ("spec", "status", "detail"),
    [
        (pack(angleIds=["front", "pose:pose-nowhere"]), 400, "spec.angleIds[1]: the look has no saved pose 'pose-nowhere'"),
        (pack(metals=["unobtainium"]), 400, "spec.metals[0]: 'unobtainium' is neither a metal preset nor 'current'"),
        (pack(turntable={"durationSec": 61}), 402, "Video length limit exceeded for Grow (max 60 s)."),
    ],
)
def test_a_bad_campaign_pack_holds_nothing(client, db, grower, scene, spec, status, detail):
    user, headers = grower

    res = _create(client, headers, scene, kind="campaign_pack", spec=spec)

    assert (res.status_code, res.json()["detail"]) == (status, detail)
    assert (_job_rows(db), _balance(db, user)) == ([], 300)


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


def test_a_repeated_idempotency_key_returns_the_same_job(client, db, owner, scene):
    user, headers = owner
    keyed = {**headers, "Idempotency-Key": "6f0d1c1e-3b8f-4a1e-9a55-0f1d2a3b4c5d"}

    first = _create(client, keyed, scene)
    again = _create(client, keyed, scene)

    assert (first.status_code, again.status_code) == (201, 200)
    assert again.json()["id"] == first.json()["id"]
    assert len(_job_rows(db)) == 1
    assert _balance(db, user) == 23


def test_a_reused_key_with_another_body_is_409(client, db, owner, scene):
    user, headers = owner
    keyed = {**headers, "Idempotency-Key": "export-1"}
    _create(client, keyed, scene)

    res = _create(client, keyed, scene, spec={**FOUR_K, "format": "jpeg"})

    assert res.status_code == 409
    assert len(_job_rows(db)) == 1
    assert _balance(db, user) == 23


def test_an_idempotency_key_belongs_to_one_user(client, db, owner, other, scene):
    other_scene = Scene(user_id=other[0].id, model_key="customers/2/models/x.glb", created_at=datetime.utcnow())
    db.add(other_scene)
    db.commit()

    mine = _create(client, {**owner[1], "Idempotency-Key": "same"}, scene)
    theirs = _create(client, {**other[1], "Idempotency-Key": "same"}, other_scene)

    assert (mine.status_code, theirs.status_code) == (201, 201)
    assert mine.json()["id"] != theirs.json()["id"]


@pytest.mark.parametrize("key", ["has spaces", "k" * 129])
def test_a_malformed_idempotency_key_is_400(client, db, owner, scene, key):
    assert _create(client, {**owner[1], "Idempotency-Key": key}, scene).status_code == 400


# ---------------------------------------------------------------------------
# Bulk and quote
# ---------------------------------------------------------------------------


def _bulk(client, headers, scene, *jobs: dict):
    bodies = [{"kind": "still", "scene_id": scene.id, "spec": FOUR_K, **job} for job in jobs]
    return client.post("/render-jobs/bulk", headers=headers, json={"jobs": bodies})


@pytest.fixture()
def grower(db, scene):
    user, headers = _sign_in(db, "grower@example.com", tier="grow")
    scene.user_id = user.id
    db.commit()
    return user, headers


def test_bulk_is_part_of_grow_and_studio(client, db, owner, scene):
    res = _bulk(client, owner[1], scene, {}, {"variant_id": "v-rose"})

    assert res.status_code == 402
    assert _job_rows(db) == []


def test_bulk_queues_every_job_with_one_hold(client, db, grower, scene):
    user, headers = grower

    res = _bulk(client, headers, scene, {}, {"variant_id": "v-rose", "spec": {**FOUR_K, "width": 2048, "height": 2048}})

    assert res.status_code == 201
    assert [job["credits"] for job in res.json()["jobs"]] == [2, 1]
    assert [row.look["material"] for row in _job_rows(db)] == ["platinum", "gold-18k-rose"]
    assert _balance(db, user) == 297


def test_one_bad_job_queues_none_of_the_bulk(client, db, grower, scene):
    user, headers = grower

    res = _bulk(client, headers, scene, {}, {"spec": {**FOUR_K, "width": 9000}})

    assert res.status_code == 400
    assert res.json()["detail"].startswith("jobs[1]: spec.width:")
    assert _job_rows(db) == []
    assert _balance(db, user) == 300


def test_bulk_takes_at_most_100_jobs_and_a_well_formed_key(client, db, grower, scene):
    headers = grower[1]

    too_many = _bulk(client, headers, scene, *([{}] * 101))
    bad_key = _bulk(client, {**headers, "Idempotency-Key": "has spaces"}, scene, {})

    assert (too_many.status_code, bad_key.status_code) == (400, 400)
    assert _job_rows(db) == []


def test_a_repeated_bulk_key_returns_the_same_jobs_and_holds_once(client, db, grower, scene):
    user, headers = grower
    keyed = {**headers, "Idempotency-Key": "k" * 128}  # a digest of it fits each job's key

    first = _bulk(client, keyed, scene, {}, {"variant_id": "v-rose"})
    again = _bulk(client, keyed, scene, {}, {"variant_id": "v-rose"})

    assert (first.status_code, again.status_code) == (201, 200)
    assert [job["id"] for job in again.json()["jobs"]] == [job["id"] for job in first.json()["jobs"]]
    assert len(_job_rows(db)) == 2
    assert _balance(db, user) == 296


def test_a_bulk_key_reused_with_another_body_is_409(client, db, grower, scene):
    user, headers = grower
    keyed = {**headers, "Idempotency-Key": "bulk-1"}
    _bulk(client, keyed, scene, {}, {})

    other_body = _bulk(client, keyed, scene, {})
    single = _create(client, keyed, scene)

    assert (other_body.status_code, single.status_code) == (409, 409)
    assert len(_job_rows(db)) == 2
    assert _balance(db, user) == 296


def test_a_key_one_create_used_cant_make_a_bulk_request(client, db, grower, scene):
    keyed = {**grower[1], "Idempotency-Key": "one-job"}
    _create(client, keyed, scene)

    assert _bulk(client, keyed, scene, {}).status_code == 409
    assert len(_job_rows(db)) == 1


def test_a_quote_prices_a_job_without_holding_anything(client, db, owner, scene):
    user, headers = owner

    res = client.post(
        "/render-jobs/quote",
        headers=headers,
        json={"kind": "angle_set", "scene_id": scene.id, "spec": {"cameras": [{"angle": "front"}, {"pose": "pose-hero"}], "width": 2000, "height": 2000, "format": "jpeg", "transparent": True}},
    )

    assert res.status_code == 200
    quote = res.json()
    assert (quote["credits"], quote["width"], quote["height"], quote["frames"]) == (2, 2000, 2000, 2)
    assert quote["outputs"] == ["RING-1-front.jpg", "RING-1-pose-hero.jpg"]
    assert quote["watermark"] is True
    assert len(quote["warnings"]) == 1
    assert _job_rows(db) == []
    assert _balance(db, user) == 25


def test_a_quote_prices_a_turntable_and_a_spin_by_their_frames(client, db, owner, scene):
    user, headers = owner
    fields = ("credits", "width", "height", "frames", "outputs", "watermark")

    turntable = client.post("/render-jobs/quote", headers=headers, json={"kind": "turntable", "scene_id": scene.id, "spec": TURNTABLE})
    spin = client.post("/render-jobs/quote", headers=headers, json={"kind": "spin", "scene_id": scene.id, "spec": SPIN})

    assert (turntable.status_code, spin.status_code) == (200, 200)
    assert [turntable.json()[field] for field in fields] == [3, 1920, 1080, 120, ["RING-1.mp4"], True]
    assert [spin.json()[field] for field in fields] == [2, 1080, 1080, 72, ["RING-1-spin.zip"], True]
    assert (_job_rows(db), _balance(db, user)) == ([], 25)


def test_a_quote_says_when_the_balance_is_short_and_refuses_what_the_plan_does(client, db, owner, scene):
    user, headers = owner
    get_or_create_billing(db, user).render_credits_balance = 1
    db.commit()

    short = client.post("/render-jobs/quote", headers=headers, json={"kind": "still", "scene_id": scene.id, "spec": FOUR_K})
    eight_k = client.post("/render-jobs/quote", headers=headers, json={"kind": "still", "scene_id": scene.id, "spec": EIGHT_K})

    assert short.json()["warnings"] == ["This needs 2 render credits and 1 are left."]
    assert eight_k.status_code == 402


def _bulk_quote(client, headers, scene, *jobs: dict):
    bodies = [{"kind": "still", "scene_id": scene.id, "spec": FOUR_K, **job} for job in jobs]
    return client.post("/render-jobs/bulk/quote", headers=headers, json={"jobs": bodies})


def test_a_bulk_quote_prices_each_job_and_says_which_ones_are_refused(client, db, owner, scene):
    user, headers = owner
    angles = {"cameras": [{"angle": "front"}, {"angle": "top"}], "width": 2048, "height": 2048}

    res = _bulk_quote(
        client, headers, scene,
        {},  # 2 credits
        {"spec": EIGHT_K},  # above Free's cap
        {"variant_id": "v-gone"},
        {"kind": "angle_set", "spec": angles},  # 1 credit an image
    )

    assert res.status_code == 200
    quote = res.json()
    assert quote["credits"] == 4
    assert [item["quote"] and item["quote"]["credits"] for item in quote["items"]] == [2, None, None, 2]
    assert [item["refused"] and item["refused"]["status"] for item in quote["items"]] == [None, 402, 404, None]
    assert quote["items"][1]["refused"]["detail"].startswith("Resolution limit exceeded for Free")
    assert quote["items"][3]["quote"]["outputs"] == ["RING-1-front.png", "RING-1-top.png"]
    # Free has no bulk requests at all; the studio shows the price with an upgrade prompt.
    assert quote["refused"] == {
        "status": 402, "detail": "Rendering several scenes or variants at once is part of Grow and Studio, not Free.",
    }
    assert (quote["warnings"], _job_rows(db), _balance(db, user)) == ([], [], 25)


def test_a_bulk_quote_prices_turntables_and_spins_and_refuses_what_the_plan_does(client, db, owner, scene):
    res = _bulk_quote(
        client, owner[1], scene,
        {"kind": "turntable", "spec": TURNTABLE},  # 3 credits
        {"kind": "spin", "spec": SPIN},  # 2 credits
        {"kind": "turntable", "spec": {**TURNTABLE, "fps": 60}},  # above Free's frame rate
        {"kind": "spin", "spec": {**SPIN, "frames": 145}},  # more frames than any spin has
    )

    assert res.status_code == 200
    quote = res.json()
    assert quote["credits"] == 5
    assert [item["quote"] and item["quote"]["outputs"] for item in quote["items"]] == [
        ["RING-1.mp4"], ["RING-1-spin.zip"], None, None,
    ]
    assert [item["refused"] and item["refused"]["status"] for item in quote["items"]] == [None, None, 402, 400]
    assert quote["items"][2]["refused"]["detail"] == "Frame rate limit exceeded for Free (max 30 fps)."


def test_a_bulk_quote_says_when_the_balance_is_short_for_the_total(client, db, grower, scene):
    user, headers = grower
    get_or_create_billing(db, user).render_credits_balance = 3
    db.commit()

    quote = _bulk_quote(client, headers, scene, {}, {}).json()

    assert (quote["credits"], quote["refused"]) == (4, None)
    assert quote["warnings"] == ["This needs 4 render credits and 3 are left."]
    assert [item["quote"]["warnings"] for item in quote["items"]] == [[], []]


def test_a_bulk_quote_takes_at_most_100_jobs(client, db, grower, scene):
    assert _bulk_quote(client, grower[1], scene, *([{}] * 101)).status_code == 400


# ---------------------------------------------------------------------------
# List, get, cancel
# ---------------------------------------------------------------------------


def test_list_pages_the_callers_jobs_newest_first(client, db, owner, other, scene):
    headers = owner[1]
    ids = [_create(client, headers, scene, spec={**FOUR_K, "width": 1024, "height": 1024}).json()["id"] for _ in range(3)]
    client.post(f"/render-jobs/{ids[0]}/cancel", headers=headers)

    first = client.get("/render-jobs", headers=headers, params={"limit": 2}).json()
    rest = client.get("/render-jobs", headers=headers, params={"limit": 2, "before": first["next_before"]}).json()
    canceled = client.get("/render-jobs", headers=headers, params={"status": "canceled", "scene_id": scene.id}).json()

    assert [job["id"] for job in first["items"]] == [ids[2], ids[1]]
    assert ([job["id"] for job in rest["items"]], rest["next_before"]) == ([ids[0]], None)
    assert [job["id"] for job in canceled["items"]] == [ids[0]]
    assert client.get("/render-jobs", headers=other[1]).json() == {"items": [], "next_before": None}
    assert client.get("/render-jobs", headers=headers, params={"limit": 101}).status_code == 422


def test_a_job_is_its_owners_only(client, db, owner, other, scene):
    job_id = _create(client, owner[1], scene).json()["id"]

    assert client.get(f"/render-jobs/{job_id}", headers=owner[1]).status_code == 200
    assert client.get(f"/render-jobs/{job_id}", headers=other[1]).status_code == 404
    assert client.post(f"/render-jobs/{job_id}/cancel", headers=other[1]).status_code == 404


def test_cancelling_a_queued_job_refunds_it(client, db, owner, scene):
    user, headers = owner
    job_id = _create(client, headers, scene).json()["id"]
    assert _balance(db, user) == 23

    canceled = client.post(f"/render-jobs/{job_id}/cancel", headers=headers)
    again = client.post(f"/render-jobs/{job_id}/cancel", headers=headers)

    assert canceled.status_code == 200
    assert (canceled.json()["status"], canceled.json()["credit_state"]) == ("canceled", "refunded")
    assert again.status_code == 409
    assert _balance(db, user) == 25


# ---------------------------------------------------------------------------
# Outputs and downloads
# ---------------------------------------------------------------------------


def _output(db, tmp_path, job_id: int, scene: Scene, name: str = "RING-1.png") -> Render:
    """An output as a worker's complete stores it (A2): a file under the job's prefix and a row."""
    key = f"customers/{scene.user_id}/renders/{job_id}/{name}"
    path = tmp_path / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\x89PNG-output")
    row = Render(
        scene_id=scene.id, job_id=job_id, key=key, bytes=11, kind="still",
        content_type="image/png", filename=name, label=None, width=3840, height=2160,
    )
    db.add(row)
    db.commit()
    return row


def test_a_job_lists_its_outputs_with_download_links(client, db, tmp_path, owner, scene):
    job_id = _create(client, owner[1], scene).json()["id"]
    output = _output(db, tmp_path, job_id, scene)

    job = client.get(f"/render-jobs/{job_id}", headers=owner[1]).json()

    assert job["outputs"] == [
        {
            "id": output.id, "kind": "still", "label": None, "filename": "RING-1.png", "content_type": "image/png",
            "bytes": 11, "width": 3840, "height": 2160,
            "download_url": f"/render-jobs/{job_id}/outputs/{output.id}/download",
        }
    ]


def test_local_storage_streams_the_download_under_its_name(client, db, tmp_path, owner, scene):
    job_id = _create(client, owner[1], scene).json()["id"]
    output = _output(db, tmp_path, job_id, scene)

    res = client.get(f"/render-jobs/{job_id}/outputs/{output.id}/download", headers=owner[1])

    assert res.status_code == 200
    assert res.content == b"\x89PNG-output"
    assert res.headers["content-type"] == "image/png"
    assert 'filename="RING-1.png"' in res.headers["content-disposition"]


def test_cloud_storage_redirects_to_a_url_signed_for_300_seconds(client, db, tmp_path, owner, scene):
    job_id = _create(client, owner[1], scene).json()["id"]
    output = _output(db, tmp_path, job_id, scene)

    with (
        patch("app.core.storage.local_file_if_exists", return_value=None),
        patch("app.core.storage.presign_get", return_value="https://r2.example.com/signed") as presign,
    ):
        res = client.get(f"/render-jobs/{job_id}/outputs/{output.id}/download", headers=owner[1], follow_redirects=False)

    assert res.status_code == 302
    assert res.headers["location"] == "https://r2.example.com/signed"
    presign.assert_called_once_with(output.key, expires_in=300)


def test_another_users_download_is_404(client, db, tmp_path, owner, other, scene):
    job_id = _create(client, owner[1], scene).json()["id"]
    output = _output(db, tmp_path, job_id, scene)
    second_job = _create(client, owner[1], scene).json()["id"]

    theirs = client.get(f"/render-jobs/{job_id}/outputs/{output.id}/download", headers=other[1])
    wrong_job = client.get(f"/render-jobs/{second_job}/outputs/{output.id}/download", headers=owner[1])
    signed_out = client.get(f"/render-jobs/{job_id}/outputs/{output.id}/download")

    assert (theirs.status_code, wrong_job.status_code, signed_out.status_code) == (404, 404, 401)
