"""GET /scenes: one page of the user's scenes, searched and counted in SQL."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.core import storage
from app.core.deps import get_current_user
from app.features.scene.service import list_scenes
from app.main import app
from app.models import Render, Scene
from app.models.user import User
from app.schemas.scene import SceneListQuery

START = datetime(2026, 1, 1)


def _scene(user_id: int, n: int, **fields) -> Scene:
    """Scene `n` of a user; a higher `n` was updated later."""
    stamp = START + timedelta(minutes=n)
    defaults = {"name": f"Scene {n}", "created_at": stamp, "updated_at": stamp}
    return Scene(user_id=user_id, model_key=f"customers/{user_id}/models/{n}.glb", **(defaults | fields))


def _add(db, *scenes: Scene) -> list[Scene]:
    db.add_all(scenes)
    db.commit()
    return list(scenes)


def _names(page) -> list[str]:
    return [item.name for item in page.items]


def _other_user(db) -> User:
    user = User(email="other@example.com", password_hash="hash", role="user", created_at=START, updated_at=START)
    db.add(user)
    db.commit()
    return user


def test_pages_hold_the_newest_scenes_first(db, sample_user):
    _add(db, *(_scene(sample_user.id, n) for n in range(1, 26)))

    first = list_scenes(db, sample_user.id, SceneListQuery(limit=10))
    last = list_scenes(db, sample_user.id, SceneListQuery(page=3, limit=10))

    assert _names(first) == [f"Scene {n}" for n in range(25, 15, -1)]
    assert (first.total, first.page, first.limit) == (25, 1, 10)
    assert _names(last) == [f"Scene {n}" for n in range(5, 0, -1)]
    assert (last.total, last.page) == (25, 3)


def test_scenes_saved_at_the_same_moment_keep_one_order_across_pages(db, sample_user):
    stamp = {"updated_at": START}
    _add(db, *(_scene(sample_user.id, n, **stamp) for n in range(1, 6)))

    pages = [list_scenes(db, sample_user.id, SceneListQuery(page=p, limit=2)) for p in (1, 2, 3)]

    assert [name for page in pages for name in _names(page)] == [f"Scene {n}" for n in range(5, 0, -1)]


def test_search_matches_name_sku_note_and_category_ignoring_case(db, sample_user):
    uid = sample_user.id
    _add(
        db,
        _scene(uid, 1, name="Halo ring"),
        _scene(uid, 2, sku="HALO-22"),
        _scene(uid, 3, note="Pairs with the halo pendant"),
        _scene(uid, 4, category="Halo sets"),
        _scene(uid, 5, name="Solitaire", sku="SOL-1", note="Classic", category="Ring"),
    )

    page = list_scenes(db, uid, SceneListQuery(q="  hALo "))

    assert sorted(_names(page)) == ["Halo ring", "Scene 2", "Scene 3", "Scene 4"]
    assert page.total == 4


def test_wildcards_in_the_search_match_themselves(db, sample_user):
    uid = sample_user.id
    _add(db, _scene(uid, 1, name="100% recycled gold"), _scene(uid, 2, name="Band_2"), _scene(uid, 3, name="Plain"))

    assert _names(list_scenes(db, uid, SceneListQuery(q="%"))) == ["100% recycled gold"]
    assert _names(list_scenes(db, uid, SceneListQuery(q="_"))) == ["Band_2"]


def test_category_matches_exactly_and_combines_with_the_search(db, sample_user):
    uid = sample_user.id
    _add(
        db,
        _scene(uid, 1, name="Halo", category="Ring"),
        _scene(uid, 2, name="Halo", category="Rings"),
        _scene(uid, 3, name="Band", category="Ring"),
    )

    assert _names(list_scenes(db, uid, SceneListQuery(category="Ring"))) == ["Band", "Halo"]
    page = list_scenes(db, uid, SceneListQuery(q="halo", category="Ring"))
    assert (_names(page), page.total) == (["Halo"], 1)


def test_only_the_owners_scenes_are_listed(db, sample_user):
    other = _other_user(db)
    _add(db, _scene(sample_user.id, 1, name="Mine"), _scene(other.id, 2, name="Theirs"))

    page = list_scenes(db, sample_user.id, SceneListQuery(q="e"))

    assert (_names(page), page.total) == (["Mine"], 1)


def test_a_page_past_the_end_answers_with_the_last_page(db, sample_user):
    _add(db, *(_scene(sample_user.id, n) for n in range(1, 8)))

    page = list_scenes(db, sample_user.id, SceneListQuery(page=9, limit=3))

    assert (_names(page), page.total, page.page) == (["Scene 1"], 7, 3)


def test_no_scenes_is_an_empty_first_page(db, sample_user):
    page = list_scenes(db, sample_user.id, SceneListQuery(page=4))

    assert (page.items, page.total, page.page, page.limit) == ([], 0, 1, 20)


def test_items_carry_their_render_counts(db, sample_user):
    busy, idle = _add(db, _scene(sample_user.id, 2, name="Busy"), _scene(sample_user.id, 1, name="Idle"))
    db.add_all(Render(scene_id=busy.id, key=f"customers/1/renders/{n}.png", created_at=START) for n in range(3))
    db.commit()

    page = list_scenes(db, sample_user.id, SceneListQuery())

    assert [(item.name, item.render_count) for item in page.items] == [("Busy", 3), ("Idle", 0)]


@pytest.fixture()
def no_storage(monkeypatch):
    """Fails the test on any storage call."""

    def refuse(*_args, **_kwargs):
        raise AssertionError("a scene list must not call storage")

    monkeypatch.setattr(storage, "get_storage", refuse)
    monkeypatch.setattr(storage, "get_public_storage", refuse)


@pytest.fixture()
def statements(db) -> list[str]:
    """SQL statements run on the test database while the test runs."""
    seen: list[str] = []

    def record(_conn, _cursor, statement, *_args):
        seen.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    yield seen
    event.remove(engine, "before_cursor_execute", record)


def test_a_thousand_scenes_answer_one_page_in_one_query_without_storage(db, sample_user, no_storage, statements):
    uid = sample_user.id
    _add(db, *(_scene(uid, n) for n in range(1, 1001)))
    statements.clear()

    page = list_scenes(db, uid, SceneListQuery(q="scene", page=7, limit=100))

    assert len(statements) == 1
    assert (page.total, len(page.items), page.items[0].name) == (1000, 100, "Scene 400")


@pytest.fixture()
def client(db, sample_user):
    from app.database import get_db

    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_current_user] = lambda: sample_user
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_the_route_answers_a_page(client, db, sample_user):
    _add(db, *(_scene(sample_user.id, n, category="Ring") for n in range(1, 4)))

    res = client.get("/scenes", params={"q": "scene", "category": "Ring", "page": 2, "limit": 2})

    assert res.status_code == 200, res.text
    body = res.json()
    assert (body["total"], body["page"], body["limit"]) == (3, 2, 2)
    assert [item["name"] for item in body["items"]] == ["Scene 1"]


@pytest.mark.parametrize(
    "params",
    [{"limit": 101}, {"limit": 0}, {"page": 0}, {"page": "two"}, {"q": "x" * 201}, {"category": "c" * 129}],
)
def test_the_route_refuses_filters_out_of_bounds(client, params):
    assert client.get("/scenes", params=params).status_code == 422
