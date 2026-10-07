"""Render plans (docs/adr/0006-bulk-pipeline.md, "Render plans", Phase F2): a converted design's
plan becomes ADR 0005 render jobs on its scene's look, which take the render credits it holds,
and a fake GPU worker drives them through complete and fail. A design is done once each of its
jobs has completed and failed once one ends without completing; its batch settles once nothing is
left to run, having charged exactly its quote; a retry renders again only what didn't complete;
canceling refunds everything unfinished, bought and plan credits each to their own pool."""

from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from ingest_samples import (  # noqa: F401 - fixtures
    WORKER_SETTINGS,
    balances,
    batch_body,
    batch_row,
    claim,
    client,
    cloud,
    complete,
    converted_files,
    create,
    designs,
    item_row,
    owner,
    sign_in,
    submitted_batch,
    upload_all,
)
from render_samples import (  # noqa: F401 - fixtures
    ANGLES,
    DEFAULT_PLAN,
    PER_DESIGN,
    STUDIO,
    api_session,
    batch_outputs,
    batch_view,
    bought,
    buy,
    convert_all,
    design_jobs,
    gpu,
    planned_batch,
    scene_of,
    set_balances,
)

from app.features.billing.quota_service import get_or_create_billing, reset_allotments
from app.features.ingest import renders
from app.features.render_jobs import worker
from app.features.render_jobs.service import cancel_job
from app.features.scene.look import saved_look, validate_look
from app.models import IngestItem, RenderJob, Scene

# ---------------------------------------------------------------------------
# The ADR's acceptance
# ---------------------------------------------------------------------------


def test_a_three_design_batch_ends_completed_with_every_output_and_charges_exactly_its_quote(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, count=3)
    assert batch["quote"] == {"model_credits": 3, "render_credits": 3 * PER_DESIGN}

    convert_all(db, cloud)
    for item in batch["items"]:
        assert [(job.kind, job.status, job.credits, job.credit_state) for job in design_jobs(db, item["id"])] == [
            ("angle_set", "queued", 4, "held"),
            ("turntable", "queued", 3, "held"),
        ]
    gpu.run_all()

    view = batch_view(client, headers, batch)
    assert (view["status"], view["counts"]) == ("completed", {"done": 3})
    assert view["charged"] == view["quote"] == {"model_credits": 3, "render_credits": 21}
    assert view["held"] == view["refunded"] == {"model_credits": 0, "render_credits": 0}
    assert balances(db, user) == (STUDIO[0] - 3, STUDIO[1] - 21)
    outputs = batch_outputs(db, batch["id"])
    assert sorted((output.kind, output.label or "") for output in outputs) == sorted(
        [("still", angle) for angle in ANGLES] * 3 + [("turntable", "")] * 3
    )


def test_a_design_whose_turntable_fails_twice_and_then_succeeds_is_done(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud)
    convert_all(db, cloud)
    gpu.complete(gpu.claim_kind("angle_set"))

    first = gpu.fail(gpu.claim_kind("turntable"))
    second = gpu.fail(gpu.claim_kind("turntable"))
    third = gpu.complete(gpu.claim_kind("turntable"))

    assert first.id == second.id == third.id  # the job's own retries, not new jobs
    assert (third.status, third.attempts, third.credit_state) == ("completed", 3, "charged")
    item = item_row(db, batch["items"][0]["id"])
    assert (item.status, item.error) == ("done", None)
    assert batch_row(db, batch["id"]).status == "completed"
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - PER_DESIGN)


def _half_way(client, db, headers, cloud, gpu) -> tuple[dict, RenderJob]:
    """Three designs held 3 model and 21 render credits: the first done, the second's angle set
    done and its turntable rendering, the third not yet converted."""
    batch = planned_batch(client, headers, cloud, count=3)
    first_conversion, second_conversion = claim(db), claim(db)
    complete(db, first_conversion, converted_files(cloud, first_conversion))
    complete(db, second_conversion, converted_files(cloud, second_conversion))
    first, second, _ = (item["id"] for item in batch["items"])
    for job in design_jobs(db, first):
        gpu.complete(gpu.claim_kind(job.kind))
    gpu.complete(gpu.claim_kind("angle_set"))
    running = gpu.claim_kind("turntable")
    assert running.ingest_item_id == second
    return batch, running


def _plan_and_bought_credits(db, user) -> None:
    """2 plan and 5 bought model credits; 15 plan and 20 bought render credits."""
    set_balances(db, user, model=2, render=15)
    buy(db, user, "model", 5)
    buy(db, user, "render", 20)


def test_canceling_mid_way_refunds_everything_not_finished_to_the_pools_it_came_from(client, db, owner, cloud, gpu):
    """The hold takes plan credits first: the third design holds 1 bought model credit and 1 plan
    and 6 bought render credits, the second design's turntable 3 plan ones. Canceling gives each
    back to the pool it came from; what completed (the first design, the second's stills) stays
    charged."""
    user, headers = owner
    _plan_and_bought_credits(db, user)
    batch, running = _half_way(client, db, headers, cloud, gpu)
    third = item_row(db, batch["items"][2]["id"])
    assert (third.render_credits_held, third.bought_render_credits_held, third.bought_model_credit_held) == (7, 6, 1)
    assert (running.credits, running.bought_credits) == (3, 0)

    canceled = client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers).json()
    assert worker.heartbeat(db, running.id, running.worker_token, progress=0.5, stage="rendering", settings=WORKER_SETTINGS).cancel
    gpu.fail(running, code="canceled", retryable=False)

    db.refresh(running)
    assert (running.status, running.credit_state) == ("canceled", "refunded")
    assert canceled["status"] == "canceled"
    assert [item_row(db, item["id"]).status for item in batch["items"]] == ["done", "canceled", "canceled"]
    view = batch_view(client, headers, batch)
    assert view["charged"] == {"model_credits": 2, "render_credits": PER_DESIGN + 4}
    assert view["refunded"] == {"model_credits": 1, "render_credits": PER_DESIGN + 3}
    assert view["held"] == {"model_credits": 0, "render_credits": 0}
    # 2 plan model credits and 11 plan render credits spent; every bought credit is back.
    assert (balances(db, user), bought(db, user)) == ((5, 24), (5, 20))


def test_a_cancel_after_an_allowance_replaced_the_plan_credits_gives_back_only_the_bought_ones(client, db, owner, cloud, gpu):
    user, headers = owner
    _plan_and_bought_credits(db, user)
    batch, running = _half_way(client, db, headers, cloud, gpu)
    reset_allotments(db, get_or_create_billing(db, user), "studio")  # the plan credits held are replaced

    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)
    gpu.fail(running, code="canceled", retryable=False)

    # The new allowance with the bought credits the hold had left, and the third design's 1 bought
    # model credit and 6 bought render credits back; none of the plan credits held.
    assert (balances(db, user), bought(db, user)) == ((STUDIO[0] + 4 + 1, STUDIO[1] + 14 + 6), (5, 20))


def test_canceling_stops_queued_renders_at_once_and_refunds_them(client, db, owner, cloud):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, count=2)
    convert_all(db, cloud)

    client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers)

    jobs = [job for item in batch["items"] for job in design_jobs(db, item["id"])]
    assert {(job.status, job.credit_state) for job in jobs} == {("canceled", "refunded")}
    assert balances(db, user) == (STUDIO[0] - 2, STUDIO[1])  # the scenes were made: their model credits stay spent
    assert batch_view(client, headers, batch)["refunded"] == {"model_credits": 0, "render_credits": 2 * PER_DESIGN}


# ---------------------------------------------------------------------------
# Fan-out: once, on the scene's look, with the design's credits
# ---------------------------------------------------------------------------


def test_a_redelivered_conversion_completion_queues_the_designs_renders_once(client, db, owner, cloud):
    user, headers = owner
    batch = planned_batch(client, headers, cloud)
    item_id = batch["items"][0]["id"]
    job = claim(db)
    reports = converted_files(cloud, job)
    complete(db, job, reports)
    converted_files(cloud, job)

    with pytest.raises(HTTPException) as again:
        complete(db, job, reports)
    renders.render_converted_design(db, item_id, scene_of(db, item_id))

    assert again.value.status_code == 409
    assert [job.kind for job in design_jobs(db, item_id)] == ["angle_set", "turntable"]
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - PER_DESIGN)


def test_the_jobs_render_the_scenes_look_as_it_was_made_behind_the_studios_jobs(client, db, owner, cloud):
    user, headers = owner
    batch = planned_batch(client, headers, cloud)
    convert_all(db, cloud)
    item = item_row(db, batch["items"][0]["id"])
    scene = db.get(Scene, item.scene_id)

    angle_set, turntable = design_jobs(db, item.id)

    look = validate_look(db, saved_look(scene), user.id)
    assert angle_set.look == turntable.look == look
    assert look["slot_selections"] == {"Metal 1": "gold-18k-yellow", "Gem 1": "diamond"}
    for job in (angle_set, turntable):
        assert (job.scene_id, job.batch_id, job.priority, job.watermark, job.max_running, job.max_attempts) == (
            scene.id, batch["id"], 10, False, 4, 3,
        )
    assert angle_set.spec["cameras"] == [{"angle": angle, "margin_pct": 8.0} for angle in ANGLES]
    assert angle_set.spec["output_names"] == [f"R-1-{angle}.jpg" for angle in ANGLES]
    assert (turntable.spec["frames"], turntable.spec["path"], turntable.spec["output_names"]) == (
        180, {"orbit": {"start": {"angle": "three-quarter", "margin_pct": 8.0}}}, ["R-1.mp4"],
    )


def test_the_jobs_render_the_batchs_look_template_as_the_scene_took_it(client, db, owner, cloud):
    """F1's template is applied when the scene is made; its jobs render the look it left."""
    user, headers = owner
    now = datetime.utcnow()
    finished = Scene(
        user_id=user.id, model_key=f"customers/{user.id}/models/look.glb", name="Two-tone solitaire", lighting="catalog",
        model_config={"slots": [{"slotId": "Metal 1", "kind": "metal"}, {"slotId": "Gem 1", "kind": "gem"}]},
        slot_selections={"Metal 1": "gold-18k-rose", "Gem 1": "ruby"},
        scene_settings={"finish": "satin", "quality_mode": "photometric"}, created_at=now, updated_at=now,
    )
    db.add(finished)
    db.commit()
    template = client.post(f"/ingest/look-templates/from-scene/{finished.id}", headers=headers)
    assert template.status_code == 201, template.text
    batch = submitted_batch(
        client, headers, cloud, batch_body(render_plan=DEFAULT_PLAN, look_template_id=template.json()["id"])
    )

    convert_all(db, cloud)

    angle_set, turntable = design_jobs(db, batch["items"][0]["id"])
    assert angle_set.look == turntable.look
    assert (angle_set.look["lighting"], angle_set.look["scene_settings"]["finish"]) == ("catalog", "satin")
    assert angle_set.look["slot_selections"] == {"Metal 1": "gold-18k-rose", "Gem 1": "ruby"}


def test_a_look_that_cant_be_rendered_fails_the_design_and_gives_back_its_render_credits(client, db, owner, cloud, monkeypatch):
    user, headers = owner
    batch = planned_batch(client, headers, cloud)

    def refuse(*_args, **_kwargs):
        raise HTTPException(status_code=400, detail="look.scene_settings.BACKGROUND: 'paper' is no longer in the catalogue")

    monkeypatch.setattr(renders, "validate_look", refuse)
    convert_all(db, cloud)

    item = item_row(db, batch["items"][0]["id"])
    assert (item.status, item.error_code, item.scene_id is not None) == ("failed", "invalid_spec", True)
    assert item.error.endswith("'paper' is no longer in the catalogue")
    assert design_jobs(db, item.id) == []
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1])  # its scene was made; its renders weren't
    assert batch_row(db, batch["id"]).status == "completed_with_errors"


def test_held_credits_are_shared_over_the_jobs_and_always_add_up():
    assert renders.share_held(7, [4, 3]) == [4, 3]
    assert renders.share_held(9, [4, 3]) == [6, 3]  # prices fell since the batch was priced
    assert renders.share_held(5, [4, 3]) == [3, 2]
    assert sum(renders.share_held(11, [3, 3, 3])) == 11


def test_a_batch_without_a_render_plan_is_done_at_conversion(client, db, owner, cloud):
    batch = submitted_batch(client, owner[1], cloud, batch_body(*designs(2)))

    convert_all(db, cloud)

    assert batch_row(db, batch["id"]).status == "completed"
    assert db.query(RenderJob).filter(RenderJob.kind != "convert").count() == 0
    assert {row.embed_url is not None for row in db.query(IngestItem)} == {True}


# ---------------------------------------------------------------------------
# A design and its batch as its jobs end; retries
# ---------------------------------------------------------------------------


def test_a_design_fails_once_a_job_fails_for_good_and_its_batch_waits_for_the_jobs_still_to_run(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud)
    convert_all(db, cloud)

    gpu.fail(gpu.claim_kind("turntable"), code="invalid_spec", retryable=False)

    item = item_row(db, batch["items"][0]["id"])
    assert (item.status, item.error_code, item.error) == ("failed", "invalid_spec", "invalid_spec!")
    assert batch_row(db, batch["id"]).status == "processing"  # its angle set still runs
    gpu.complete(gpu.claim_kind("angle_set"))
    assert batch_row(db, batch["id"]).status == "completed_with_errors"
    assert item_row(db, item.id).status == "failed"
    assert sorted(output.label for output in batch_outputs(db, batch["id"])) == sorted(ANGLES)  # what finished stays
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - 4)


def test_a_retry_renders_again_only_the_job_that_failed_and_holds_its_credits_again(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud)
    convert_all(db, cloud)
    gpu.complete(gpu.claim_kind("angle_set"))
    for _ in range(3):
        gpu.fail(gpu.claim_kind("turntable"), code="gpu_lost")
    item_id = batch["items"][0]["id"]
    assert (item_row(db, item_id).status, batch_row(db, batch["id"]).status) == ("failed", "completed_with_errors")
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - 4)

    retried = client.post(f"/ingest/batches/{batch['id']}/items/{item_id}/retry", headers=headers)

    assert retried.status_code == 200, retried.text
    assert (retried.json()["status"], retried.json()["attempts"]) == ("rendering", 1)
    assert [job["kind"] for job in retried.json()["jobs"]] == ["angle_set", "turntable"]
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - PER_DESIGN)  # the turntable's 3, held again
    assert batch_row(db, batch["id"]).status == "processing"
    gpu.complete(gpu.claim_kind("turntable"))
    assert [(job.kind, job.status) for job in design_jobs(db, item_id)] == [
        ("angle_set", "completed"), ("turntable", "failed"), ("turntable", "completed"),
    ]
    assert (item_row(db, item_id).status, batch_row(db, batch["id"]).status) == ("done", "completed")
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - PER_DESIGN)


def test_a_retry_while_a_sibling_still_renders_queues_only_the_failed_part_and_charges_the_quote_once(
    client, db, owner, cloud, gpu
):
    """The turntable fails for good while the angle set renders: the design is failed and can be
    retried, but the retry queues only a turntable, holds only its 3 credits, and leaves the angle
    set to finish; once both have, the design has charged exactly its quote."""
    user, headers = owner
    batch = planned_batch(client, headers, cloud)
    convert_all(db, cloud)
    item_id = batch["items"][0]["id"]
    rendering = gpu.claim_kind("angle_set")
    gpu.fail(gpu.claim_kind("turntable"), code="invalid_spec", retryable=False)
    assert item_row(db, item_id).status == "failed"
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - 4)  # the turntable's 3 back

    retried = client.post(f"/ingest/batches/{batch['id']}/items/{item_id}/retry", headers=headers)

    assert retried.status_code == 200, retried.text
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - PER_DESIGN)  # the turntable's 3 held again, nothing more
    assert [(job.kind, job.status) for job in design_jobs(db, item_id)] == [
        ("angle_set", "running"), ("turntable", "failed"), ("turntable", "queued"),
    ]
    assert [job["id"] for job in retried.json()["jobs"] if job["kind"] == "angle_set"] == [rendering.id]
    gpu.complete(rendering)
    gpu.run_all()

    assert (item_row(db, item_id).status, batch_row(db, batch["id"]).status) == ("done", "completed")
    assert sorted(output.label or "mp4" for output in batch_outputs(db, batch["id"])) == sorted([*ANGLES, "mp4"])
    view = batch_view(client, headers, batch)
    assert view["charged"] == view["quote"] == {"model_credits": 1, "render_credits": PER_DESIGN}
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - PER_DESIGN)


def test_a_design_converted_before_render_plans_ran_is_rendered_once_and_its_batch_settles(
    client, db, owner, cloud, gpu, monkeypatch
):
    """Before F2 a conversion left a design converted, its render credits held, no job queued.
    The sweep each claim makes queues its jobs once, from the credits it holds (bought ones
    included), and the batch then settles having charged its quote."""
    from app.features.ingest import conversions

    user, headers = owner
    set_balances(db, user, model=10, render=4)
    buy(db, user, "render", 20)
    batch = planned_batch(client, headers, cloud, count=2)
    with monkeypatch.context() as before_f2:  # neither the fan-out nor the sweep existed yet
        before_f2.setattr(conversions, "render_converted_design", lambda *args: None)
        before_f2.setattr(worker, "resume_converted_designs", lambda *args: None)
        convert_all(db, cloud)
    stranded = [item_row(db, item["id"]) for item in batch["items"]]
    assert [(item.status, item.render_credits_held, item.bought_render_credits_held) for item in stranded] == [
        ("converted", 7, 3), ("converted", 7, 7),
    ]
    assert batch_row(db, batch["id"]).status == "processing"

    first = gpu.claim()  # the sweep before the claim queues both designs' jobs
    renders.resume_converted_designs(db)  # and again: nothing more
    gpu.claim()  # nor on the next claim

    jobs = [job for item in batch["items"] for job in design_jobs(db, item["id"])]
    assert [(job.kind, job.credits, job.bought_credits) for job in jobs] == [
        ("angle_set", 4, 0), ("turntable", 3, 3), ("angle_set", 4, 4), ("turntable", 3, 3),
    ]
    assert first.id == jobs[0].id
    assert {item_row(db, item["id"]).status for item in batch["items"]} == {"rendering"}
    assert {item_row(db, item["id"]).render_credits_held for item in batch["items"]} == {0}
    for job in db.query(RenderJob).filter(RenderJob.status == "running").all():
        gpu.complete(job)
    gpu.run_all()
    assert batch_row(db, batch["id"]).status == "completed"
    assert batch_view(client, headers, batch)["charged"] == {"model_credits": 2, "render_credits": 2 * PER_DESIGN}
    assert (balances(db, user), bought(db, user)) == ((8, 24 - 2 * PER_DESIGN), (0, 10))


def test_a_render_its_owner_cancels_fails_its_design_which_can_render_it_again(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud)
    convert_all(db, cloud)
    item_id = batch["items"][0]["id"]
    angle_set, _ = design_jobs(db, item_id)

    cancel_job(db, user, angle_set.id)

    item = item_row(db, item_id)
    assert (item.status, item.error_code) == ("failed", "canceled")
    assert balances(db, user) == (STUDIO[0] - 1, STUDIO[1] - 3)
    retried = client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers).json()
    assert retried["retried"] == [item_id]
    gpu.run_all()
    assert (item_row(db, item_id).status, batch_row(db, batch["id"]).status) == ("done", "completed")


def test_a_lease_lapsing_on_a_renders_last_attempt_fails_its_design(client, db, owner, cloud, gpu, monkeypatch):
    class Clock:
        now = datetime.utcnow()

        @classmethod
        def utcnow(cls):
            return cls.now

    batch = planned_batch(client, owner[1], cloud)
    convert_all(db, cloud)
    monkeypatch.setattr(worker, "datetime", Clock)
    turntable = gpu.claim_kind("turntable")
    for _ in range(3):
        Clock.now += timedelta(seconds=200)
        worker.take_back_lapsed_leases(db, Clock.now)
        db.refresh(turntable)
        if turntable.status == "queued":
            turntable.run_after = None
            db.commit()
            gpu.claim_kind("turntable")

    item = item_row(db, batch["items"][0]["id"])
    assert (turntable.status, turntable.credit_state, item.status, item.error_code) == ("failed", "refunded", "failed", "lease_expired")


# ---------------------------------------------------------------------------
# The plan's price, the hold at submit and the batch page
# ---------------------------------------------------------------------------


def test_the_render_plan_quote_is_what_a_batch_holds_and_charges(client, owner):
    quote = client.post("/ingest/render-plan/quote", headers=owner[1], json={"render_plan": DEFAULT_PLAN})

    assert quote.status_code == 200, quote.text
    assert quote.json() == {
        "render_credits": PER_DESIGN,
        "jobs": [{"kind": "angle_set", "credits": 4, "files": 4}, {"kind": "turntable", "credits": 3, "files": 1}],
    }


@pytest.mark.parametrize(
    ("plan", "status", "detail"),
    [
        ({"turntable": {"width": 7680, "height": 4320, "fps": 30, "seconds": 30}}, 402, "Video length limit exceeded for Grow (max 20 s at 8K)."),
        ({"turntable": {"width": 1080, "height": 1080, "fps": 90, "seconds": 6}}, 400, "render_plan.turntable.fps"),
        ({"stills": {"angles": ["back"], "size": 2000}}, 400, "render_plan.stills.angles[0]"),
    ],
)
def test_the_quote_refuses_what_a_batch_would(client, db, plan, status, detail):
    _, headers = sign_in(db, "grow@example.com", tier="grow")

    res = client.post("/ingest/render-plan/quote", headers=headers, json={"render_plan": plan})

    assert res.status_code == status
    assert res.json()["detail"].startswith(detail)


def test_submitting_a_batch_the_render_credits_cant_cover_is_402_and_holds_nothing(client, db, owner, cloud):
    user, headers = owner
    set_balances(db, user, model=500, render=3 * PER_DESIGN - 1)
    batch = create(client, headers, batch_body(*designs(3), render_plan=DEFAULT_PLAN)).json()
    upload_all(client, headers, cloud, batch)

    res = client.post(f"/ingest/batches/{batch['id']}/submit", headers=headers)

    assert res.status_code == 402
    assert res.json()["detail"].startswith("This needs 3 model credits and 21 render credits; 500 model credits and 20 render credits are left.")
    assert balances(db, user) == (500, 20)
    assert batch_row(db, batch["id"]).status == "draft"


def test_submitting_rechecks_the_plan_against_the_owners_caps(client, db, owner, cloud, monkeypatch):
    from app.features.render_jobs import plan_limits

    user, headers = owner
    batch = create(client, headers, batch_body(render_plan=DEFAULT_PLAN)).json()
    upload_all(client, headers, cloud, batch)
    monkeypatch.setattr(plan_limits, "video_refusal", lambda *args: "Frame rate limit exceeded for Studio (max 24 fps).")

    res = client.post(f"/ingest/batches/{batch['id']}/submit", headers=headers)

    assert (res.status_code, res.json()["detail"]) == (402, "Frame rate limit exceeded for Studio (max 24 fps).")
    assert balances(db, user) == STUDIO


def test_the_batch_page_reads_each_designs_jobs_with_their_progress_and_outputs(client, db, owner, cloud, gpu):
    user, headers = owner
    batch = planned_batch(client, headers, cloud, count=2)
    convert_all(db, cloud)
    gpu.complete(gpu.claim_kind("angle_set"))
    running = gpu.claim_kind("turntable")
    worker.heartbeat(db, running.id, running.worker_token, progress=0.4, stage="encoding", settings=WORKER_SETTINGS)

    page = client.get(f"/ingest/batches/{batch['id']}/items", headers=headers).json()["items"]
    view = batch_view(client, headers, batch)

    first_jobs = {job["kind"]: job for job in page[0]["jobs"]}
    assert (first_jobs["angle_set"]["status"], first_jobs["angle_set"]["credit_state"]) == ("completed", "charged")
    assert [output["label"] for output in first_jobs["angle_set"]["outputs"]] == ANGLES
    assert first_jobs["angle_set"]["outputs"][0]["download_url"].startswith(f"/render-jobs/{first_jobs['angle_set']['id']}/outputs/")
    assert (first_jobs["turntable"]["status"], first_jobs["turntable"]["progress"], first_jobs["turntable"]["stage"]) == ("running", 0.4, "encoding")
    assert [job["status"] for job in page[1]["jobs"]] == ["queued", "queued"]
    assert view["counts"] == {"rendering": 2}
    assert view["held"] == {"model_credits": 0, "render_credits": 3 + PER_DESIGN}
    assert view["charged"] == {"model_credits": 2, "render_credits": 4}
