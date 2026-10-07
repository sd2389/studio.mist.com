"""Credits for a batch (docs/adr/0006-bulk-pipeline.md, "Credits for a batch"): submitting holds a
model credit and the render plan's credits for every design in one conditional UPDATE (402 naming
the shortfall, and nothing held); each design keeps what it holds and gets it back once when it
fails or is canceled; a retry holds again."""

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from ingest_samples import (  # noqa: F401 - fixtures
    STILLS_PLAN,
    balances,
    batch_body,
    batch_row,
    claim,
    client,
    cloud,
    complete,
    converted_files,
    create,
    design,
    designs,
    fail,
    item_row,
    owner,
    set_flag,
    sign_in,
    submitted_batch,
    upload_all,
)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.features.billing.credit_pools import bought_credits
from app.features.billing.purchases import record_topup_purchase
from app.features.billing.quota_service import (
    change_plan,
    get_or_create_billing,
    hold_batch_credits,
    reset_allotments,
    set_subscription_period,
)
from app.features.ingest import lifecycle
from app.models import Base, IngestItem, RenderJob, Scene, User

STUDIO = (500, 1500)  # Studio's model and render credits a month


def _set_billing(db, user: User, **fields) -> None:
    billing = get_or_create_billing(db, user)
    for name, value in fields.items():
        setattr(billing, name, value)
    db.commit()


def _held(db, batch: dict) -> list[tuple[int, int]]:
    db.expire_all()
    rows = db.query(IngestItem).filter(IngestItem.batch_id == batch["id"]).order_by(IngestItem.position).all()
    return [(row.model_credit_held, row.render_credits_held) for row in rows]


def _jobs(db) -> list[RenderJob]:
    db.expire_all()
    return db.query(RenderJob).order_by(RenderJob.id).all()


def _submit(client, headers, batch: dict):
    return client.post(f"/ingest/batches/{batch['id']}/submit", headers=headers)


# ---------------------------------------------------------------------------
# Holding
# ---------------------------------------------------------------------------


def test_submitting_holds_every_designs_credits_once(client, db, owner, cloud):
    user, headers = owner
    period = datetime(2026, 10, 1)
    _set_billing(db, user, period_start=period)
    batch = create(client, headers, batch_body(*designs(3), render_plan=STILLS_PLAN)).json()
    upload_all(client, headers, cloud, batch)

    submitted = _submit(client, headers, batch)
    again = _submit(client, headers, batch)

    assert submitted.status_code == again.status_code == 200
    body = submitted.json()
    assert (body["status"], body["counts"]) == ("processing", {"converting": 3})
    assert body["quote"] == body["held"] == {"model_credits": 3, "render_credits": 12}
    assert body["submitted_at"] is not None
    assert balances(db, user) == (STUDIO[0] - 3, STUDIO[1] - 12)
    assert _held(db, batch) == [(1, 4)] * 3
    assert {row.credits_period_start for row in db.query(IngestItem)} == {period}
    assert {row.credits_allowance_generation for row in db.query(IngestItem)} == {1}  # sign_in's reset
    jobs = _jobs(db)
    assert [(job.kind, job.status, job.priority, job.credits, job.credit_state, job.watermark, job.max_running) for job in jobs] == [
        ("convert", "queued", 10, 0, "none", False, 4)
    ] * 3
    assert [job.ingest_item_id for job in jobs] == [item["id"] for item in batch["items"]]


def test_designs_still_uploading_hold_their_credits_from_the_submit(client, db, owner, cloud):
    user, headers = owner
    batch = create(client, headers, batch_body(*designs(2))).json()

    _submit(client, headers, batch)

    assert _held(db, batch) == [(1, 0), (1, 0)]
    assert balances(db, user) == (STUDIO[0] - 2, STUDIO[1])
    assert _jobs(db) == []  # each converts once its upload is confirmed


@pytest.mark.parametrize(("model_left", "render_left"), [(2, 1500), (500, 11)])
def test_a_batch_the_credits_cant_cover_is_402_and_holds_nothing(client, db, owner, cloud, model_left, render_left):
    user, headers = owner
    _set_billing(db, user, model_credits_balance=model_left, render_credits_balance=render_left)
    batch = create(client, headers, batch_body(*designs(3), render_plan=STILLS_PLAN)).json()
    upload_all(client, headers, cloud, batch)

    res = _submit(client, headers, batch)

    assert res.status_code == 402
    assert res.json()["detail"].startswith(
        f"This needs 3 model credits and 12 render credits; {model_left} model credits and {render_left} render credits are left."
    )
    assert balances(db, user) == (model_left, render_left)
    assert batch_row(db, batch["id"]).status == "draft"
    assert _held(db, batch) == [(0, 0)] * 3
    assert _jobs(db) == []


def test_two_submits_at_once_cant_overspend(tmp_path):
    """Two batches whose designs the balance covers one at a time; only the first holds. The
    second session read the balance before the first committed, as a second API process would."""
    from app.features.ingest.service import create_batch
    from app.schemas.ingest import IngestBatchCreate

    engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    with Session() as setup:
        user = User(email="race@example.com", password_hash="h", role="user", created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        setup.add(user)
        setup.commit()
        reset_allotments(setup, get_or_create_billing(setup, user), "studio")
        _set_billing(setup, user, model_credits_balance=3)
        batch_ids = [
            create_batch(setup, user, IngestBatchCreate.model_validate(batch_body(*designs(2, prefix=prefix))))[0].id
            for prefix in ("A", "B")
        ]
        user_id = user.id

    first, second = Session(), Session()
    try:
        users = [session.get(User, user_id) for session in (first, second)]
        assert get_or_create_billing(second, users[1]).model_credits_balance == 3  # read before the first holds
        lifecycle.submit_batch(first, users[0], batch_ids[0])
        with pytest.raises(HTTPException) as exc:
            lifecycle.submit_batch(second, users[1], batch_ids[1])
        assert exc.value.status_code == 402
    finally:
        first.close()
        second.close()
    with Session() as check:
        assert get_or_create_billing(check, check.get(User, user_id)).model_credits_balance == 1
        assert [row.model_credit_held for row in check.query(IngestItem).order_by(IngestItem.id)] == [1, 1, 0, 0]
    engine.dispose()


def test_the_hold_leaves_the_commit_to_the_caller(db, sample_user):
    """So a batch's hold and the designs it pays for are committed together, or not at all."""
    _set_billing(db, sample_user, plan_tier="studio", model_credits_balance=10, render_credits_balance=10)

    hold_batch_credits(db, sample_user.id, 4, 8)
    db.rollback()

    assert balances(db, sample_user) == (10, 10)


def test_a_downgraded_owner_cant_submit_a_batch_their_plan_no_longer_takes(client, db, owner, cloud):
    user, headers = owner
    batch = create(client, headers, batch_body(*designs(150))).json()
    _set_billing(db, user, plan_tier="grow")

    res = _submit(client, headers, batch)

    assert res.status_code == 402
    assert res.json()["detail"] == "A Grow batch holds at most 100 designs; this one has 150."
    assert batch_row(db, batch["id"]).status == "draft"


def test_studio_jobs_dont_wait_behind_a_batchs_conversions(client, db, cloud):
    """The plan's cap on queued exports counts the studio's jobs; a batch's own limits bound its."""
    user, headers = sign_in(db, "grow@example.com", tier="grow")  # 20 queued exports
    submitted_batch(client, headers, cloud, batch_body(*designs(25)))
    set_flag(db, "server_exports", True)
    now = datetime.utcnow()
    scene = Scene(user_id=user.id, model_key=f"customers/{user.id}/models/ring.glb", created_at=now, updated_at=now)
    db.add(scene)
    db.commit()

    res = client.post(
        "/render-jobs", headers=headers, json={"kind": "still", "scene_id": scene.id, "spec": {"camera": {"pose": "pose-default"}, "width": 1024, "height": 1024}}
    )

    assert res.status_code == 201, res.text
    assert len(_jobs(db)) == 26


# ---------------------------------------------------------------------------
# Giving back
# ---------------------------------------------------------------------------


def test_a_design_that_fails_gets_back_what_it_holds(client, db, owner, cloud):
    user, headers = owner
    batch = submitted_batch(client, headers, cloud, batch_body(*designs(2), render_plan=STILLS_PLAN))
    job = claim(db)

    fail(db, job, "model_unreadable")

    first = item_row(db, batch["items"][0]["id"])
    assert (first.status, first.error_code, first.error) == ("failed", "model_unreadable", "model_unreadable!")
    assert _held(db, batch) == [(0, 0), (1, 4)]
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - 4)
    assert batch_row(db, batch["id"]).status == "processing"


def test_a_retryable_failure_keeps_the_design_converting_and_its_credits_held(client, db, owner, cloud):
    user, headers = owner
    batch = submitted_batch(client, headers, cloud)
    job = claim(db)

    fail(db, job, "browser_crashed", retryable=True)

    assert (item_row(db, batch["items"][0]["id"]).status, _held(db, batch)) == ("converting", [(1, 0)])
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1])


def test_canceling_gives_back_what_every_unfinished_design_holds(client, db, owner, cloud):
    user, headers = owner
    batch = create(client, headers, batch_body(*designs(3), render_plan=STILLS_PLAN)).json()
    upload_all(client, headers, cloud, {**batch, "items": batch["items"][:2]})
    _submit(client, headers, batch)
    assert balances(db, user) == (STUDIO[0] - 3, STUDIO[1] - 12)

    res = client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    assert res.status_code == 200
    body = res.json()
    assert (body["status"], body["counts"], body["held"]) == ("canceled", {"canceled": 3}, {"model_credits": 0, "render_credits": 0})
    assert balances(db, user) == STUDIO
    assert [(job.status, job.finished_at is not None) for job in _jobs(db)] == [("canceled", True)] * 2
    row = batch_row(db, batch["id"])
    assert row.expires_at == row.finished_at + timedelta(days=30)
    assert {(item.error_code, item.error) for item in db.query(IngestItem)} == {("canceled", "Canceled with its batch.")}


def test_a_running_conversion_is_asked_to_stop_and_refunded_once(client, db, owner, cloud):
    user, headers = owner
    batch = submitted_batch(client, headers, cloud)
    job = claim(db)

    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)
    db.refresh(job)
    assert (job.status, job.cancel_requested_at is not None) == ("running", True)
    assert balances(db, user) == STUDIO
    fail(db, job, "unknown", retryable=True)

    db.refresh(job)
    assert (job.status, job.error_code) == ("canceled", "canceled")
    assert item_row(db, batch["items"][0]["id"]).status == "canceled"
    assert balances(db, user) == STUDIO


def test_canceling_again_answers_the_batch_and_a_finished_one_is_409(client, db, owner, cloud):
    user, headers = owner
    batch = create(client, headers, batch_body()).json()
    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    again = client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)
    submit = _submit(client, headers, batch)
    row = batch_row(db, batch["id"])
    row.status = "completed"
    db.commit()
    finished = client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    assert (again.status_code, again.json()["status"]) == (200, "canceled")
    assert (submit.status_code, finished.status_code) == (409, 409)


def _buy(db, user: User, kind: str, credits: int) -> None:
    """A paid top-up, as the Stripe webhook records it."""
    record_topup_purchase(
        db, get_or_create_billing(db, user), kind=kind, credits=credits,
        session_id=f"cs_{kind}", event_id=f"evt_{kind}", amount_total=None, currency=None,
    )


def _bought(db, user: User) -> tuple[int, int]:
    """(model credits, render credits) bought, of those left."""
    billing = get_or_create_billing(db, user)
    db.refresh(billing)
    return bought_credits(billing, "model"), bought_credits(billing, "render")


def _held_bought(db, batch: dict) -> list[tuple[int, int]]:
    db.expire_all()
    rows = db.query(IngestItem).filter(IngestItem.batch_id == batch["id"]).order_by(IngestItem.position).all()
    return [(row.bought_model_credit_held, row.bought_render_credits_held) for row in rows]


def test_canceling_gives_the_bought_credits_a_batch_held_back_as_bought(client, db, owner, cloud):
    """1 plan model credit and 5 bought; 4 plan render credits and 20 bought. Three designs hold
    3 model and 12 render credits, plan credits first; canceling gives each pool back what it lost,
    so the next reset keeps every bought credit."""
    user, headers = owner
    _set_billing(db, user, model_credits_balance=1, render_credits_balance=4)
    _buy(db, user, "model", 5)
    _buy(db, user, "render", 20)
    batch = create(client, headers, batch_body(*designs(3), render_plan=STILLS_PLAN)).json()
    upload_all(client, headers, cloud, batch)

    _submit(client, headers, batch)

    assert _held(db, batch) == [(1, 4)] * 3
    assert _held_bought(db, batch) == [(0, 0), (1, 4), (1, 4)]
    assert (balances(db, user), _bought(db, user)) == ((3, 12), (3, 12))
    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)
    assert (balances(db, user), _bought(db, user)) == ((6, 24), (5, 20))
    assert _held_bought(db, batch) == [(0, 0)] * 3
    reset_allotments(db, get_or_create_billing(db, user), "studio")
    assert (balances(db, user), _bought(db, user)) == ((STUDIO[0] + 5, STUDIO[1] + 20), (5, 20))


def test_a_failed_design_gives_back_its_own_bought_credits(client, db, owner, cloud):
    user, headers = owner
    _set_billing(db, user, model_credits_balance=0, render_credits_balance=0)
    _buy(db, user, "model", 2)
    _buy(db, user, "render", 8)
    batch = submitted_batch(client, headers, cloud, batch_body(*designs(2), render_plan=STILLS_PLAN))
    assert _held_bought(db, batch) == [(1, 4), (1, 4)]

    fail(db, claim(db), "model_unreadable")

    assert _held_bought(db, batch) == [(0, 0), (1, 4)]
    assert (balances(db, user), _bought(db, user)) == ((1, 4), (1, 4))


def test_a_converted_design_spends_its_bought_model_credit_and_its_jobs_take_its_bought_render_credits(
    client, db, owner, cloud
):
    user, headers = owner
    _set_billing(db, user, model_credits_balance=0, render_credits_balance=0)
    _buy(db, user, "model", 1)
    _buy(db, user, "render", 4)
    batch = submitted_batch(client, headers, cloud, batch_body(render_plan=STILLS_PLAN))
    job = claim(db)

    complete(db, job, converted_files(cloud, job))

    assert _held_bought(db, batch) == [(0, 0)]
    [angle_set] = [one for one in _jobs(db) if one.kind == "angle_set"]
    assert (angle_set.credits, angle_set.bought_credits, angle_set.credit_state) == (4, 4, "held")
    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)
    assert (balances(db, user), _bought(db, user)) == ((0, 4), (0, 4))


def test_a_refund_after_the_period_rolled_over_gives_back_only_the_bought_credits(client, db, owner, cloud):
    """The new period's allowance replaced the plan credits the designs held; their bought ones are
    still the customer's."""
    user, headers = owner
    _set_billing(db, user, period_start=datetime(2026, 9, 1), model_credits_balance=1, render_credits_balance=4)
    _buy(db, user, "model", 1)
    _buy(db, user, "render", 4)
    batch = submitted_batch(client, headers, cloud, batch_body(*designs(2), render_plan=STILLS_PLAN))
    assert _held_bought(db, batch) == [(0, 0), (1, 4)]
    set_subscription_period(
        db, get_or_create_billing(db, user), tier="studio",
        period_start=datetime(2026, 10, 1), period_end=datetime(2026, 11, 1), stripe_subscription_id="sub_1",
    )

    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    assert (balances(db, user), _bought(db, user)) == ((STUDIO[0] + 1, STUDIO[1] + 4), (1, 4))


OCTOBER, NOVEMBER = datetime(2026, 10, 1), datetime(2026, 11, 1)


def _one_bought_model_credit_and_two_of_four_render_credits_bought(db, user) -> None:
    """The balances a design of STILLS_PLAN then holds: 1 model credit, bought, and 4 render
    credits, 2 of them the plan's and 2 bought."""
    _set_billing(db, user, model_credits_balance=0, render_credits_balance=2)
    _buy(db, user, "model", 1)
    _buy(db, user, "render", 2)


def _move_period_without_a_grant(db, user) -> None:
    """What customer.subscription.updated does: the plan's period moves, no credits change."""
    change_plan(
        db, get_or_create_billing(db, user), tier="studio",
        period_start=OCTOBER, period_end=NOVEMBER, stripe_subscription_id="sub_1",
    )


def test_a_design_held_between_a_renewals_events_refunds_no_plan_credits_on_top_of_the_new_allowance(
    client, db, owner, cloud
):
    """The period moves, the batch is submitted, then invoice.paid grants the new allowance: when
    the design fails, its bought credits come back and its plan ones, replaced, don't."""
    user, headers = owner
    _one_bought_model_credit_and_two_of_four_render_credits_bought(db, user)
    _move_period_without_a_grant(db, user)
    batch = submitted_batch(client, headers, cloud, batch_body(render_plan=STILLS_PLAN))
    assert _held_bought(db, batch) == [(1, 2)]
    set_subscription_period(
        db, get_or_create_billing(db, user), tier="studio",
        period_start=OCTOBER, period_end=NOVEMBER, stripe_subscription_id="sub_1",
    )

    fail(db, claim(db), "model_unreadable")

    assert (balances(db, user), _bought(db, user)) == ((STUDIO[0] + 1, STUDIO[1] + 2), (1, 2))


def test_a_design_refunded_after_a_reset_gives_back_no_plan_credits(client, db, owner, cloud):
    """An admin's reset, reset_allotments as Free's monthly one, leaves the period as it is."""
    user, headers = owner
    _one_bought_model_credit_and_two_of_four_render_credits_bought(db, user)
    batch = submitted_batch(client, headers, cloud, batch_body(render_plan=STILLS_PLAN))
    reset_allotments(db, get_or_create_billing(db, user), "studio")

    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    assert (balances(db, user), _bought(db, user)) == ((STUDIO[0] + 1, STUDIO[1] + 2), (1, 2))


def test_a_design_refunded_after_the_period_moved_without_a_grant_gives_back_its_plan_credits(
    client, db, owner, cloud
):
    user, headers = owner
    _one_bought_model_credit_and_two_of_four_render_credits_bought(db, user)
    batch = submitted_batch(client, headers, cloud, batch_body(render_plan=STILLS_PLAN))
    _move_period_without_a_grant(db, user)

    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    assert (balances(db, user), _bought(db, user)) == ((1, 4), (1, 2))


def test_a_refund_after_the_period_rolled_over_adds_nothing(client, db, owner, cloud):
    """The new period's allotment replaced the balances the credits came out of."""
    user, headers = owner
    _set_billing(db, user, period_start=datetime(2026, 9, 1))
    batch = submitted_batch(client, headers, cloud, batch_body(*designs(2), render_plan=STILLS_PLAN))
    set_subscription_period(
        db, get_or_create_billing(db, user), tier="studio",
        period_start=datetime(2026, 10, 1), period_end=datetime(2026, 11, 1), stripe_subscription_id="sub_1",
    )

    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    assert balances(db, user) == STUDIO
    assert _held(db, batch) == [(0, 0), (0, 0)]


# ---------------------------------------------------------------------------
# Retries
# ---------------------------------------------------------------------------


def _failed_batch(client, db, headers, cloud, count: int = 2) -> dict:
    """A submitted batch whose first design failed."""
    batch = submitted_batch(client, headers, cloud, batch_body(*designs(count), render_plan=STILLS_PLAN))
    fail(db, claim(db), "model_unreadable")
    return batch


def test_a_retry_holds_the_credits_again_and_converts_the_design_again(client, db, owner, cloud):
    user, headers = owner
    batch = _failed_batch(client, db, headers, cloud)
    first_id = batch["items"][0]["id"]
    old_job = item_row(db, first_id).convert_job_id

    res = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers)

    assert res.status_code == 200
    body = res.json()
    assert (body["retried"], body["refused"], body["batch"]["counts"]) == ([first_id], [], {"converting": 2})
    item = item_row(db, first_id)
    assert (item.status, item.attempts, item.error, item.error_code) == ("converting", 1, None, None)
    assert (item.model_credit_held, item.render_credits_held) == (1, 4)
    assert item.convert_job_id != old_job
    assert db.get(RenderJob, item.convert_job_id).status == "queued"
    assert balances(db, user) == (STUDIO[0] - 2, STUDIO[1] - 8)


def test_a_retry_refuses_a_design_whose_sku_was_taken_meanwhile(client, db, owner, cloud):
    user, headers = owner
    batch = _failed_batch(client, db, headers, cloud)
    first = batch["items"][0]
    now = datetime.utcnow()
    db.add(Scene(user_id=user.id, model_key="customers/1/models/x.glb", sku=first["sku"], created_at=now, updated_at=now))
    db.commit()

    all_failed = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers).json()
    one = client.post(f"/ingest/batches/{batch['id']}/items/{first['id']}/retry", headers=headers)

    assert (all_failed["retried"], all_failed["refused"]) == (
        [], [{"item_id": first["id"], "code": "sku_taken", "message": f"{first['sku']}: SKU already exists."}]
    )
    assert (one.status_code, one.json()["detail"]) == (409, f"{first['sku']}: SKU already exists.")
    assert item_row(db, first["id"]).status == "failed"
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - 4)


def test_one_design_retries_by_itself(client, db, owner, cloud):
    headers = owner[1]
    batch = _failed_batch(client, db, headers, cloud)
    first, second = batch["items"]

    not_failed = client.post(f"/ingest/batches/{batch['id']}/items/{second['id']}/retry", headers=headers)
    retried = client.post(f"/ingest/batches/{batch['id']}/items/{first['id']}/retry", headers=headers)
    unknown = client.post(f"/ingest/batches/{batch['id']}/items/999/retry", headers=headers)

    assert (not_failed.status_code, not_failed.json()["detail"]) == (409, f"Item {second['id']} is converting, not failed.")
    assert (retried.status_code, retried.json()["status"], retried.json()["attempts"]) == (200, "converting", 1)
    assert unknown.status_code == 404


def test_a_retry_the_credits_cant_cover_is_402_and_changes_nothing(client, db, owner, cloud):
    user, headers = owner
    batch = _failed_batch(client, db, headers, cloud)
    _set_billing(db, user, model_credits_balance=0)

    res = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers)

    assert res.status_code == 402
    assert item_row(db, batch["items"][0]["id"]).status == "failed"


def test_a_retry_opens_a_finished_batch_again_when_there_is_room(client, db, owner, cloud):
    user, headers = owner
    batch = submitted_batch(client, headers, cloud)
    fail(db, claim(db), "model_unreadable")
    assert batch_row(db, batch["id"]).status == "completed_with_errors"
    others = [create(client, headers, batch_body(design(f"o{n}.stl", sku=f"O-{n}"))).json() for n in range(3)]

    full = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers)
    client.post(f"/ingest/batches/{others[0]['id']}/cancel", headers=headers)
    reopened = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers)

    assert full.status_code == 429
    assert reopened.status_code == 200
    row = batch_row(db, batch["id"])
    assert (row.status, row.finished_at, row.expires_at) == ("processing", None, None)


def test_only_a_submitted_batch_retries(client, db, owner, cloud):
    headers = owner[1]
    batch = create(client, headers, batch_body()).json()

    draft = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers)
    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)
    canceled = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers)

    assert (draft.status_code, canceled.status_code) == (409, 409)
