from datetime import datetime
from app.models.scene import Scene
from app.features.scene.service import first_scene_for_model


def test_viewer_filename_resolves_customer_storage(db, sample_user):
    now = datetime.utcnow()
    scene = Scene(user_id=sample_user.id, name="Bracelet", model_key="customers/1/models/unique-bracelet.glb", created_at=now, updated_at=now)
    db.add(scene)
    db.commit()
    assert first_scene_for_model(db, "models/unique-bracelet.glb").id == scene.id
    assert first_scene_for_model(db, "models/missing.glb") is None


def test_ambiguous_filename_is_not_resolved(db, sample_user):
    now = datetime.utcnow()
    for owner in (1, 2):
        db.add(Scene(user_id=sample_user.id, name="Ring", model_key=f"customers/{owner}/models/ring.glb", created_at=now, updated_at=now))
    db.commit()
    assert first_scene_for_model(db, "models/ring.glb") is None
