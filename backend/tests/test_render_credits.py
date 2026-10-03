"""Render credits per plan; holds, charges and refunds are in test_render_job_credits.py."""

from app.features.billing.plans import PLAN_QUOTAS


def test_plan_quotas_define_render_credits():
    assert PLAN_QUOTAS["free"].render_credits == 25
    assert PLAN_QUOTAS["grow"].render_credits == 300
    assert PLAN_QUOTAS["studio"].render_credits == 1500
