from app.core import storage_keys as keys


def test_customer_model_key_prefix():
    key = keys.model_key(42, "ring.glb")
    assert key.startswith("customers/42/models/")
    assert key.endswith(".glb")


def test_key_belongs_to_user():
    key = keys.model_key(7, "test.glb")
    assert keys.key_belongs_to_user(key, 7)
    assert not keys.key_belongs_to_user(key, 8)


def test_public_published_keys():
    model = keys.public_model_key(3, "SKU-001")
    thumb = keys.public_thumbnail_key(3, "SKU-001")
    assert model == "published/3/SKU-001/model.glb"
    assert thumb == "published/3/SKU-001/thumbnail.webp"
    assert keys.is_public_published_key(model)


def test_render_job_outputs_live_under_their_jobs_prefix():
    key = keys.render_job_output_key(5, 812, "solitaire-4K.png")
    assert key == "customers/5/renders/812/solitaire-4K.png"
    assert key.startswith(keys.render_job_prefix(5, 812))
    assert keys.key_belongs_to_user(key, 5)
