"""Making a bulk upload batch (docs/adr/0006-bulk-pipeline.md, E1): every design checked, its
manifest row found and its SKU free before anything is made; the plan's limits; reading batches;
the owner only; and the bulk_pipeline flag."""

from datetime import datetime

import pytest
from ingest_samples import (  # noqa: F401 - fixtures
    batch_body,
    client,
    cloud,
    create,
    design,
    designs,
    other,
    owner,
    problems,
    set_flag,
    sign_in,
)

from app.features.ingest.designs import sku_from_filename, stem_from_filename
from app.models import IngestBatch, IngestItem, Scene

MANIFEST_HEADER = "file,sku,name,category,note,units"


def _scene_with_sku(db, user_id: int, sku: str) -> Scene:
    now = datetime.utcnow()
    scene = Scene(user_id=user_id, model_key=f"customers/{user_id}/models/{sku}.glb", sku=sku, created_at=now, updated_at=now)
    db.add(scene)
    db.commit()
    return scene


def _batches(db) -> list[IngestBatch]:
    db.expire_all()
    return db.query(IngestBatch).order_by(IngestBatch.id).all()


def _codes(found: list[dict]) -> list[tuple]:
    return [(problem["item"], problem["row"], problem["field"], problem["code"]) for problem in found]


# ---------------------------------------------------------------------------
# A batch is made
# ---------------------------------------------------------------------------


def test_a_batch_is_made_with_its_designs_awaiting_their_uploads(client, db, owner):
    user, headers = owner
    body = batch_body(
        design("rings/Solitaire 1ct.3dm", 4_200_000),
        design("pendants/P-220.obj", 900, companions=[{"filename": "pendants/P-220.mtl", "bytes": 120}]),
        name="  Autumn rings ",
    )

    res = create(client, headers, body)

    assert res.status_code == 201, res.text
    batch = res.json()
    assert (batch["name"], batch["status"], batch["source"], batch["item_count"]) == ("Autumn rings", "draft", "studio", 2)
    assert batch["total_bytes"] == 4_200_000 + 900 + 120
    assert batch["counts"] == {"awaiting_upload": 2}
    assert batch["quote"] == {"model_credits": 2, "render_credits": 0}
    assert batch["held"] == {"model_credits": 0, "render_credits": 0}
    assert batch["options"] == {"decimate": "auto", "default_category": "Ring"}
    first, second = batch["items"]
    assert (first["position"], first["filename"], first["bytes"], first["status"]) == (0, "rings/Solitaire 1ct.3dm", 4_200_000, "awaiting_upload")
    # Without a manifest, a design is named from its file, as the upload page names a model.
    assert (first["sku"], first["name"], first["category"], first["units"]) == ("Solitaire-1ct", "Solitaire 1ct", "Ring", "auto")
    assert second["companions"] == [{"filename": "pendants/P-220.mtl", "bytes": 120}]
    rows = db.query(IngestItem).order_by(IngestItem.position).all()
    assert rows[0].source_key == f"customers/{user.id}/ingest/{batch['id']}/{rows[0].id}/Solitaire_1ct.3dm"
    assert rows[1].companions == [
        {"filename": "pendants/P-220.mtl", "key": f"customers/{user.id}/ingest/{batch['id']}/{rows[1].id}/companions/0-P-220.mtl", "bytes": 120}
    ]


def test_an_item_may_name_its_own_design_without_a_manifest(client, owner):
    body = batch_body(design("a.stl", sku="R-7", name="Huggies", category="earrings", note="Best seller", units="MM"))

    item = create(client, owner[1], body).json()["items"][0]

    assert (item["sku"], item["name"], item["category"], item["note"], item["units"]) == ("R-7", "Huggies", "Earrings", "Best seller", "mm")


@pytest.mark.parametrize(
    ("filename", "stem", "sku"),
    [
        ("rings/R-1001.3dm", "R-1001", "R-1001"),
        ("Halo pendant (v2).stp", "Halo pendant (v2)", "Halo-pendant-v2"),
        ("--weird--.obj", "--weird--", "weird"),
        ("✨.stl", "✨", "MODEL-001"),
        ("a" * 80 + ".glb", "a" * 80, "a" * 64),
    ],
)
def test_names_and_skus_from_file_names_match_the_upload_page(filename, stem, sku):
    """src/lib/upload/metadata-from-filename.ts."""
    assert (stem_from_filename(filename), sku_from_filename(filename)) == (stem, sku)


# ---------------------------------------------------------------------------
# The manifest
# ---------------------------------------------------------------------------


def test_a_manifest_maps_files_to_skus_names_categories_notes_and_units(client, owner):
    manifest = "\n".join(
        [
            "﻿File, SKU ,name,category,note,units",
            "rings/R-1001.3dm,R-1001,Solitaire 1 ct,Ring,,",
            'PENDANTS\\P-220.STP,P-220,"Halo pendant, rose",pendant,Bestseller,',
            "E-17.stl,E-17,Huggies,Earrings,,cm",
            ",,,,,",
        ]
    )
    body = batch_body(design("rings/R-1001.3dm"), design("pendants/P-220.stp"), design("earrings/E-17.stl"), design("x/no-row.ply"), manifest=manifest)

    res = create(client, owner[1], body)

    assert res.status_code == 201, res.text
    items = [(item["sku"], item["name"], item["category"], item["note"], item["units"]) for item in res.json()["items"]]
    assert items == [
        ("R-1001", "Solitaire 1 ct", "Ring", None, "auto"),
        ("P-220", "Halo pendant, rose", "Pendant", "Bestseller", "auto"),
        ("E-17", "Huggies", "Earrings", None, "cm"),  # by its file name, the only one so named
        ("no-row", "no-row", "Ring", None, "auto"),  # a file without a row is named from itself
    ]


def test_a_500_row_manifest_is_checked_in_one_call_with_a_problem_per_row(client, db, owner):
    """Every row of a large manifest is checked at once; nothing is made while any has a problem."""
    user, headers = owner
    _scene_with_sku(db, user.id, "R-7")
    rows = [f"rings/R-{number}.stl,R-{number},Ring {number},Ring,," for number in range(1, 501)]
    rows[9] = "rings/R-10.stl,R 10!,Ring 10,Ring,,"  # not a SKU
    rows[19] = "rings/R-20.stl,R-19,Ring 20,Ring,,"  # item 18's SKU
    rows[29] = "rings/R-30.stl,R-30,Ring 30,Tiara,,"  # no such category
    rows[39] = "rings/R-40.stl,R-40,Ring 40,Ring,,feet"  # no such unit
    rows[49] = "rings/R-50.stl,R-50,Ring 50,Ring,,mm,extra"  # a cell too many
    rows.append("rings/R-999.stl,R-999,Not dropped,Ring,,")  # no such file
    rows.append("rings/R-60.stl,R-60b,Again,Ring,,")  # a second row for one file
    manifest = "\n".join([MANIFEST_HEADER, *rows])

    found = problems(create(client, headers, batch_body(*designs(500), manifest=manifest)))

    # The header is row 1, so design n is on row n + 2; the batch's own problems come first.
    assert _codes(found) == [
        (None, 51, "manifest", "row_too_long"),
        (None, 502, "file", "file_not_in_batch"),
        (6, 8, "sku", "sku_taken"),  # R-7, a scene's
        (9, 11, "sku", "sku_invalid"),
        (19, 21, "sku", "sku_repeated"),
        (29, 31, "category", "category_unknown"),
        (39, 41, "units", "units_unknown"),
        (59, 503, "file", "file_listed_twice"),
    ]
    assert found[4]["message"] == "R-19 is item 18's SKU too."
    assert _batches(db) == []


@pytest.mark.parametrize(
    ("manifest", "code"),
    [
        ("sku,name\nR-1,Ring", "column_missing"),
        ("file,colour\nr.stl,red", "column_unknown"),
        ("file,sku,sku\nr.stl,R-1,R-2", "column_repeated"),
        ("file,\nr.stl,", "column_unknown"),
        ("", "manifest_empty"),
        ("file,note\n" + "r.stl," + "n" * 140_000, "manifest_unreadable"),  # past the CSV reader's cell size
    ],
)
def test_a_manifest_whose_header_or_text_is_wrong_is_refused(client, owner, manifest, code):
    found = problems(create(client, owner[1], batch_body(design("r.stl"), manifest=manifest)))

    assert code in {problem["code"] for problem in found}


def test_a_manifest_over_a_megabyte_is_refused(client, owner):
    in_bytes = "file,note\n" + "r.stl," + "é" * 600_000  # 600,000 characters, 1.2 MB of UTF-8
    in_characters = "file,note\n" + "r.stl," + "n" * 1_048_600

    found = problems(create(client, owner[1], batch_body(design("r.stl"), manifest=in_bytes)))
    too_long = create(client, owner[1], batch_body(design("r.stl"), manifest=in_characters))

    assert [problem["code"] for problem in found] == ["manifest_too_large"]
    assert too_long.status_code == 422  # the request's own cap


def test_text_with_control_characters_is_a_problem(client, owner):
    """Names are one line; notes keep tabs and line breaks; none of them stores a NUL."""
    manifest = f"{MANIFEST_HEADER}\na.stl,A,\"Ring\x00\",,,\nb.stl,B,,,\"line one\nline\ttwo\",\nc.stl,C,,,bad\x07bell,"

    found = problems(create(client, owner[1], batch_body(design("a.stl"), design("b.stl"), design("c.stl"), manifest=manifest)))
    blank_name = create(client, owner[1], batch_body(name="Rings\x00"))

    # Rows are records, as a spreadsheet numbers them: b's two-line note is all row 3.
    assert _codes(found) == [(0, 2, "name", "name_invalid"), (2, 4, "note", "note_invalid")]
    assert _codes(problems(blank_name)) == [(None, None, "name", "name_invalid")]


def test_a_row_naming_a_file_two_designs_share_must_give_its_folders(client, owner):
    manifest = f"{MANIFEST_HEADER}\nR-1.stl,R-1,,,,\nb/R-1.stl,R-2,,,,"

    found = problems(create(client, owner[1], batch_body(design("a/R-1.stl"), design("b/R-1.stl"), manifest=manifest)))

    assert _codes(found) == [(None, 2, "file", "file_ambiguous")]


def test_with_a_manifest_an_item_gives_its_file_only(client, owner):
    manifest = f"{MANIFEST_HEADER}\nr.stl,R-1,,,,"

    found = problems(create(client, owner[1], batch_body(design("r.stl", sku="R-1"), manifest=manifest)))

    assert _codes(found) == [(0, None, "item", "metadata_twice")]


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("item", "field", "code"),
    [
        (design("ring.exe"), "filename", "format_unsupported"),
        (design("ring.glb.zip"), "filename", "format_unsupported"),
        (design("../ring.stl"), "filename", "filename_invalid"),
        (design("/abs/ring.stl"), "filename", "filename_invalid"),
        (design("rings\\ring.stl"), "filename", "filename_invalid"),
        (design("rings//ring.stl"), "filename", "filename_invalid"),
        (design("ri\nng.stl"), "filename", "filename_invalid"),
        (design("r" * 252 + ".stl"), "filename", "filename_invalid"),
        (design("ring.stl", 0), "bytes", "file_empty"),
        (design("ring.stl", 100 * 1024 * 1024 + 1), "bytes", "file_too_large"),
        (design("ring.stl", companions=[{"filename": "ring.mtl", "bytes": 10}]), "companions[0].filename", "companion_unsupported"),
        (design("ring.obj", companions=[{"filename": "ring.png", "bytes": 10}]), "companions[0].filename", "companion_unsupported"),
        (design("ring.obj", companions=[{"filename": "ring.mtl", "bytes": 0}]), "companions[0].bytes", "file_empty"),
        (
            design("ring.gltf", companions=[{"filename": "a/ring.bin", "bytes": 5}, {"filename": "b/RING.bin", "bytes": 5}]),
            "companions[1].filename",
            "companion_repeated",
        ),
    ],
)
def test_a_file_that_cant_be_uploaded_and_converted_is_a_problem(client, db, owner, item, field, code):
    found = problems(create(client, owner[1], batch_body(design("fine.stl"), item)))

    assert _codes(found) == [(1, None, field, code)]
    assert _batches(db) == []


def test_two_designs_of_one_file_are_a_problem(client, owner):
    found = problems(create(client, owner[1], batch_body(design("Rings/R-1.stl", sku="A"), design("rings/r-1.STL", sku="B"))))

    assert _codes(found) == [(1, None, "filename", "filename_repeated")]


@pytest.mark.parametrize(
    ("fields", "field", "code"),
    [
        ({"sku": "R 1"}, "sku", "sku_invalid"),
        ({"sku": "R-" + "1" * 63}, "sku", "sku_invalid"),
        ({"name": "two\nlines"}, "name", "name_invalid"),
        ({"category": "Tiara"}, "category", "category_unknown"),
        ({"units": "feet"}, "units", "units_unknown"),
    ],
)
def test_a_design_named_wrongly_is_a_problem(client, owner, fields, field, code):
    found = problems(create(client, owner[1], batch_body(design("ring.stl", **fields))))

    assert _codes(found) == [(0, None, field, code)]


def test_units_are_for_files_without_units_of_their_own(client, owner):
    res = create(client, owner[1], batch_body(design("a.obj", units="cm"), design("b.ply", units="in"), design("c.3dm", units="mm")))

    assert _codes(problems(res)) == [(2, None, "units", "units_not_needed")]


def test_the_default_category_must_be_one(client, owner):
    found = problems(create(client, owner[1], batch_body(options={"default_category": "Crown"})))

    assert _codes(found) == [(None, None, "options.default_category", "category_unknown")]


def test_a_batch_with_a_blank_name_is_a_problem(client, owner):
    assert _codes(problems(create(client, owner[1], batch_body(name="   ")))) == [(None, None, "name", "name_invalid")]


@pytest.mark.parametrize(
    "body",
    [
        {"name": "B", "items": []},
        {"name": "B", "items": [design()], "colour": "red"},
        {"name": "B", "items": [design(size=-1)]},
        {"name": "B", "items": [{**design(), "extra": 1}]},
        {"name": "B", "items": [design(companions=[{"filename": f"{n}.mtl", "bytes": 1} for n in range(9)])]},
        {"name": "B", "items": [design()] * 1001},
        {"name": "B", "items": [design()], "options": {"decimate": "never"}},
    ],
)
def test_a_create_body_is_strict(client, owner, body):
    assert create(client, owner[1], body).status_code == 422


# ---------------------------------------------------------------------------
# SKUs
# ---------------------------------------------------------------------------


def test_skus_are_checked_against_scenes_and_open_batches_before_anything_uploads(client, db, owner, other):
    user, headers = owner
    _scene_with_sku(db, other[0].id, "TAKEN")
    assert create(client, other[1], batch_body(design("r.stl", sku="RESERVED"))).status_code == 201

    found = problems(
        create(client, headers, batch_body(design("a.stl", sku="TAKEN"), design("b.stl", sku="RESERVED"), design("c.stl", sku="FREE")))
    )

    assert _codes(found) == [(0, None, "sku", "sku_taken"), (1, None, "sku", "sku_reserved")]
    assert len(_batches(db)) == 1


def test_skus_are_case_sensitive(client, db, owner):
    _scene_with_sku(db, owner[0].id, "R-1")

    assert create(client, owner[1], batch_body(design("a.stl", sku="r-1"))).status_code == 201


def test_a_sku_a_finished_design_had_is_free_again(client, db, owner):
    user, headers = owner
    batch = create(client, headers, batch_body(design("a.stl", sku="R-1"))).json()
    assert client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers).status_code == 200

    assert create(client, headers, batch_body(design("b.stl", sku="R-1"))).status_code == 201


def test_the_sku_check_says_which_skus_are_taken_or_reserved(client, db, owner, other):
    _scene_with_sku(db, other[0].id, "TAKEN")
    create(client, other[1], batch_body(design("r.stl", sku="RESERVED")))

    res = client.post("/ingest/sku-check", headers=owner[1], json={"skus": ["FREE", "TAKEN", " RESERVED ", "taken"]})

    assert res.status_code == 200
    assert res.json() == {"taken": ["TAKEN"], "reserved": ["RESERVED"]}
    assert client.post("/ingest/sku-check", headers=owner[1], json={"skus": ["x"] * 1001}).status_code == 422


# ---------------------------------------------------------------------------
# The plan's limits
# ---------------------------------------------------------------------------


def test_free_has_no_bulk_upload(client, db):
    _, headers = sign_in(db, "free@example.com", tier="free")

    res = create(client, headers, batch_body())

    assert res.status_code == 402
    assert res.json()["detail"] == "Bulk upload is part of Grow and Studio, not Free."
    assert _batches(db) == []


@pytest.mark.parametrize(("tier", "allowed"), [("grow", 100), ("studio", 500)])
def test_a_batch_over_its_plans_designs_is_402(client, db, tier, allowed):
    _, headers = sign_in(db, f"{tier}@example.com", tier=tier)

    over = create(client, headers, batch_body(*designs(allowed + 1)))
    at = create(client, headers, batch_body(*designs(allowed)))

    assert over.status_code == 402
    assert over.json()["detail"] == f"A {tier.title()} batch holds at most {allowed} designs; this one has {allowed + 1}."
    assert at.status_code == 201


@pytest.mark.parametrize(("tier", "gigabytes"), [("grow", 5), ("studio", 20)])
def test_a_batch_over_its_plans_bytes_is_402(client, db, tier, gigabytes):
    _, headers = sign_in(db, f"{tier}@example.com", tier=tier)
    per_file = 100 * 1024 * 1024
    count = gigabytes * 1024**3 // per_file
    items = [design(f"r{n}.stl", per_file) for n in range(count)]

    at = create(client, headers, batch_body(*items))
    over = create(client, headers, batch_body(*items[:-1], design("last.stl", per_file), design("one-more.stl", per_file)))

    assert at.status_code == 201, at.text
    assert over.status_code == 402
    assert over.json()["detail"].startswith(f"A {tier.title()} batch holds at most {gigabytes} GB of files")


def test_at_most_three_batches_are_open_at_once(client, db, owner):
    user, headers = owner
    made = [create(client, headers, batch_body(design(f"r{n}.stl", sku=f"R-{n}"))).json() for n in range(3)]

    fourth = create(client, headers, batch_body(design("r9.stl", sku="R-9")))
    client.post(f"/ingest/batches/{made[0]['id']}/cancel", headers=headers)
    after_cancel = create(client, headers, batch_body(design("r9.stl", sku="R-9")))

    assert fourth.status_code == 429
    assert fourth.json()["detail"] == "At most 3 batches can be open at once: finish or cancel one first."
    assert after_cancel.status_code == 201


@pytest.mark.parametrize(
    ("tier", "limits"),
    [
        ("free", {"max_designs": 0, "max_bytes": 0, "max_file_bytes": 100 * 1024**2, "max_open_batches": 3}),
        ("grow", {"max_designs": 100, "max_bytes": 5 * 1024**3, "max_file_bytes": 100 * 1024**2, "max_open_batches": 3}),
        ("studio", {"max_designs": 500, "max_bytes": 20 * 1024**3, "max_file_bytes": 100 * 1024**2, "max_open_batches": 3}),
    ],
)
def test_the_plans_batch_limits_are_in_its_billing_snapshot_and_the_pricing_catalog(client, db, tier, limits):
    """The upload page shows them before anything uploads, from the same BATCH_LIMITS the batch is held to."""
    _, headers = sign_in(db, f"{tier}@example.com", tier=tier)

    account = client.get("/billing/account", headers=headers)
    catalog = {plan["tier"]: plan for plan in client.get("/billing/pricing").json()["plans"]}

    assert account.status_code == 200
    assert account.json()["features"]["bulk_upload"] == limits
    assert catalog[tier]["features"]["bulk_upload"] == limits


# ---------------------------------------------------------------------------
# The render plan
# ---------------------------------------------------------------------------


STILLS = {"angles": ["front", "three-quarter", "side", "top"], "size": 2000}
TURNTABLE = {"width": 1080, "height": 1080, "fps": 30, "seconds": 6, "quality": "high"}
SPIN = {"frames": 72, "size": 1080, "format": "jpeg", "jpeg_quality": 0.9}


@pytest.mark.parametrize(
    ("plan", "per_design"),
    [
        ({"stills": STILLS}, 4),  # four 2000 px stills, a credit each
        ({"stills": STILLS, "turntable": TURNTABLE}, 7),  # the ADR's default plan: and 6 s at 1080², 3
        ({"stills": STILLS, "turntable": TURNTABLE, "spin": SPIN}, 9),  # and 72 frames at 1080², 2
        ({"turntable": {**TURNTABLE, "fps": 60, "seconds": 15}}, 12),  # two started 10 s, double above 30 fps
    ],
)
def test_a_render_plan_is_priced_as_the_jobs_it_becomes(client, owner, plan, per_design):
    batch = create(client, owner[1], batch_body(*designs(3), render_plan=plan)).json()

    assert batch["quote"] == {"model_credits": 3, "render_credits": 3 * per_design}


def test_a_render_plan_is_kept_normalised(client, owner):
    plan = {"stills": STILLS, "turntable": TURNTABLE, "thumbnail_from": "front"}

    kept = create(client, owner[1], batch_body(render_plan=plan)).json()["render_plan"]

    assert kept == {
        "stills": {**STILLS, "format": "jpeg", "jpeg_quality": 0.92, "transparent": False, "margin_pct": 8.0},
        "turntable": TURNTABLE,
        "spin": None,
        "publish_media": False,  # private unless asked
        "thumbnail_from": "front",
    }


@pytest.mark.parametrize(
    ("plan", "detail"),
    [
        ({}, "render_plan: a render plan makes stills, a turntable or a spin"),
        ({"stills": {"angles": ["front", "front"], "size": 2000}}, "render_plan.stills.angles: each angle at most once"),
        ({"stills": {"angles": ["back"], "size": 2000}}, "render_plan.stills.angles[0]"),
        ({"stills": {"angles": ["front"], "size": 6001}}, "render_plan.stills.size"),
        ({"stills": {"angles": ["front"], "size": "2000"}}, "render_plan.stills.size"),
        ({"turntable": {**TURNTABLE, "width": 1081}}, "render_plan.turntable.width: must be even"),
        ({"turntable": {**TURNTABLE, "fps": 90}}, "render_plan.turntable.fps: Input should be less than or equal to 60"),
        ({"turntable": {**TURNTABLE, "seconds": 61}}, "render_plan.turntable.seconds"),
        ({"turntable": {**TURNTABLE, "width": 8192, "height": 8192}}, "render_plan.turntable: at most 36 megapixels a frame"),
        ({"spin": {**SPIN, "frames": 145}}, "render_plan.spin.frames"),
        ({"stills": STILLS, "thumbnail_from": "back"}, "render_plan.thumbnail_from"),
        ({"turntable": TURNTABLE, "thumbnail_from": "front"}, "render_plan: thumbnail_from: one of the stills' angles"),
        ({"stills": STILLS, "look": "gold"}, "render_plan.look"),
    ],
)
def test_a_render_plan_that_isnt_one_is_400(client, db, owner, plan, detail):
    res = create(client, owner[1], batch_body(render_plan=plan))

    assert res.status_code == 400
    assert res.json()["detail"].startswith(detail), res.json()["detail"]
    assert _batches(db) == []


@pytest.mark.parametrize(
    ("plan", "detail"),
    [
        ({"turntable": {**TURNTABLE, "width": 7680, "height": 4320, "seconds": 30}}, "Video length limit exceeded for Grow (max 20 s at 8K)."),
        ({"spin": {**SPIN, "frames": 144, "size": 2048}}, None),
    ],
)
def test_a_render_plan_is_capped_by_the_owners_plan(client, db, plan, detail):
    _, headers = sign_in(db, "grow@example.com", tier="grow")

    res = create(client, headers, batch_body(render_plan=plan))

    if detail is None:
        assert res.status_code == 201
    else:
        assert (res.status_code, res.json()["detail"]) == (402, detail)


# ---------------------------------------------------------------------------
# Idempotency
# ---------------------------------------------------------------------------


def test_a_repeated_idempotency_key_answers_the_batch_it_made(client, db, owner):
    headers = {**owner[1], "Idempotency-Key": "batch-1"}

    first = create(client, headers, batch_body())
    again = create(client, headers, batch_body())
    other_body = create(client, headers, batch_body(name="Another"))

    assert (first.status_code, again.status_code, other_body.status_code) == (201, 200, 409)
    assert again.json()["id"] == first.json()["id"]
    assert len(_batches(db)) == 1


def test_a_malformed_idempotency_key_is_400(client, owner):
    assert create(client, {**owner[1], "Idempotency-Key": "a key"}, batch_body()).status_code == 400


# ---------------------------------------------------------------------------
# Reading batches, the owner only
# ---------------------------------------------------------------------------


def test_a_batch_and_its_designs_are_read_by_status_and_page(client, owner):
    headers = owner[1]
    batch = create(client, headers, batch_body(*designs(7))).json()

    one = client.get(f"/ingest/batches/{batch['id']}", headers=headers).json()
    page = client.get(f"/ingest/batches/{batch['id']}/items", headers=headers, params={"page": 2, "limit": 3}).json()
    none = client.get(f"/ingest/batches/{batch['id']}/items", headers=headers, params={"status": "failed"}).json()
    listed = client.get("/ingest/batches", headers=headers).json()

    assert (one["id"], one["counts"]) == (batch["id"], {"awaiting_upload": 7})
    assert ([item["position"] for item in page["items"]], page["total"], page["page"], page["limit"]) == ([3, 4, 5], 7, 2, 3)
    assert (none["items"], none["total"]) == ([], 0)
    assert [item["id"] for item in listed["items"]] == [batch["id"]]
    assert client.get(f"/ingest/batches/{batch['id']}/items", headers=headers, params={"status": "lost"}).status_code == 422


def test_another_users_batch_is_404(client, db, owner, other, cloud):
    batch = create(client, owner[1], batch_body()).json()
    item_id = batch["items"][0]["id"]
    ids = {"item_ids": [item_id]}

    calls = [
        client.get(f"/ingest/batches/{batch['id']}", headers=other[1]),
        client.get(f"/ingest/batches/{batch['id']}/items", headers=other[1]),
        client.post(f"/ingest/batches/{batch['id']}/uploads", headers=other[1], json=ids),
        client.post(f"/ingest/batches/{batch['id']}/uploaded", headers=other[1], json=ids),
        client.post(f"/ingest/batches/{batch['id']}/submit", headers=other[1]),
        client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=other[1]),
        client.post(f"/ingest/batches/{batch['id']}/items/{item_id}/retry", headers=other[1]),
        client.post(f"/ingest/batches/{batch['id']}/cancel", headers=other[1]),
    ]

    assert [res.status_code for res in calls] == [404] * len(calls)
    assert client.get("/ingest/batches", headers=other[1]).json()["items"] == []
    assert _batches(db)[0].status == "draft"


def test_the_endpoints_need_a_signed_in_user(client, owner):
    batch = create(client, owner[1], batch_body()).json()

    assert create(client, {}, batch_body()).status_code == 401
    assert client.get(f"/ingest/batches/{batch['id']}").status_code == 401
    assert client.post(f"/ingest/batches/{batch['id']}/cancel").status_code == 401


# ---------------------------------------------------------------------------
# The bulk_pipeline flag
# ---------------------------------------------------------------------------


def test_the_bulk_pipeline_is_off_until_an_admin_turns_it_on(client, db, owner):
    from app.models import FeatureFlag

    db.query(FeatureFlag).delete()
    db.commit()

    assert create(client, owner[1], batch_body()).status_code == 404
    assert client.get("/features").json()["flags"]["bulk_pipeline"] is False


def test_with_the_flag_off_no_work_starts_but_a_batch_can_still_be_read_and_canceled(client, db, owner):
    headers = owner[1]
    batch = create(client, headers, batch_body()).json()
    ids = {"item_ids": [batch["items"][0]["id"]]}
    set_flag(db, "bulk_pipeline", False)

    refused = [
        create(client, headers, batch_body(design("x.stl", sku="X"))),
        client.post("/ingest/sku-check", headers=headers, json={"skus": ["X"]}),
        client.post(f"/ingest/batches/{batch['id']}/uploads", headers=headers, json=ids),
        client.post(f"/ingest/batches/{batch['id']}/uploaded", headers=headers, json=ids),
        client.post(f"/ingest/batches/{batch['id']}/submit", headers=headers),
        client.post(f"/ingest/batches/{batch['id']}/retry-failed", headers=headers),
    ]

    assert [res.status_code for res in refused] == [404] * len(refused)
    assert client.get(f"/ingest/batches/{batch['id']}", headers=headers).status_code == 200
    assert client.post(f"/ingest/batches/{batch['id']}/cancel", headers=headers).json()["status"] == "canceled"


def test_with_uploads_off_no_batch_starts(client, db, owner):
    set_flag(db, "upload", False)

    assert create(client, owner[1], batch_body()).status_code == 503


def test_every_batch_call_counts_once_against_the_rate_limit(client, db, owner, monkeypatch):
    from app.core import rate_limit

    counted: list[str] = []
    real = rate_limit.check_rate_limit
    monkeypatch.setattr(rate_limit, "check_rate_limit", lambda db, key, **kw: (counted.append(key), real(db, key, **kw))[1])
    headers = owner[1]

    batch = create(client, headers, batch_body(*designs(150))).json()
    client.post(f"/ingest/batches/{batch['id']}/uploads", headers=headers, json={"item_ids": [item["id"] for item in batch["items"][:100]]})
    client.get(f"/ingest/batches/{batch['id']}", headers=headers)

    assert counted == [f"ingest:user:{owner[0].id}"] * 2
