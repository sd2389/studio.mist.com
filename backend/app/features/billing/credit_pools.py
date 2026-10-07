"""Plan credits and bought credits, kept apart in every balance that can be bought.

A balance (model_credits_balance, ...) is what a customer can spend: their plan's credits for
the period plus the credits they bought. Spending takes plan credits first, so bought credits are
the last to go, and a reset or a plan change replaces the plan credits and keeps the bought ones.

Model, AI image and render credits can be bought (top-ups; render top-ups have no pack yet).
Each has a bought_* column: how many of the balance's credits were bought when the balance last
grew. Spending lowers only the balance and leaves bought_* alone, so the bought credits left are
min(bought_*, balance): plan credits go first. A spend stays one conditional UPDATE, and a hold
can tell what it took from each pool from the row the UPDATE returns: the balance before was the
balance after plus the spend, and bought_* hasn't moved. Every statement that raises a balance
first sets bought_* to min(bought_*, balance), then adds the bought credits it brings.

Custom material and asset credits are never sold: they are plan credits only.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, case
from sqlalchemy.orm import InstrumentedAttribute

from app.features.billing.plans import PlanTier, get_quotas
from app.models.billing import UserBilling

# The kinds that can be bought, by the names top-ups and admin adjustments give them.
BOUGHT_KINDS = ("model", "ai", "render")

_BALANCES = {
    "model": UserBilling.model_credits_balance,
    "ai": UserBilling.ai_image_credits_balance,
    "render": UserBilling.render_credits_balance,
}
_BOUGHT = {
    "model": UserBilling.bought_model_credits,
    "ai": UserBilling.bought_ai_image_credits,
    "render": UserBilling.bought_render_credits,
}


def balance_column(kind: str) -> InstrumentedAttribute[int]:
    return _BALANCES[kind]


def bought_column(kind: str) -> InstrumentedAttribute[int]:
    return _BOUGHT[kind]


def bought_left(kind: str) -> ColumnElement[int]:
    """The bought credits a balance holds, min(bought_*, balance), in SQL. In an UPDATE's SET it
    reads the row as it was before the statement, as every SET expression does."""
    balance, bought = _BALANCES[kind], _BOUGHT[kind]
    return case((bought < balance, bought), else_=balance)


def bought_credits(billing: UserBilling, kind: str) -> int:
    """The bought credits a loaded billing row holds of one kind."""
    balance = getattr(billing, _BALANCES[kind].key) or 0
    bought = getattr(billing, _BOUGHT[kind].key) or 0
    return max(0, min(bought, balance))


def taken_from_bought(bought: int, balance_after: int, spent: int) -> int:
    """How many of `spent` credits a spend took from bought ones, read off the row it left: the
    balance was balance_after + spent, and bought_* is what it was."""
    return max(0, min(bought, balance_after + spent) - max(0, min(bought, balance_after)))


def credit_values(kind: str, *, plan: int | ColumnElement[int] = 0, bought: int = 0) -> dict[Any, Any]:
    """SET values that add `plan` and `bought` credits to a balance of a kind that can be bought;
    the bought ones stay bought. `plan` may be SQL, as a refund's is."""
    balance = _BALANCES[kind]
    return {balance: balance + plan + bought, _BOUGHT[kind]: bought_left(kind) + bought}


def allowance_values(tier: PlanTier) -> dict[Any, Any]:
    """SET values that make `tier`'s allowance the account's plan credits: each balance becomes
    the allowance plus the bought credits it holds, which stay bought."""
    quotas = get_quotas(tier)
    allowances = {"model": quotas.model_credits, "ai": quotas.ai_image_credits, "render": quotas.render_credits}
    values: dict[Any, Any] = {
        UserBilling.custom_material_credits_balance: quotas.custom_material_credits,
        UserBilling.custom_asset_credits_balance: quotas.custom_asset_credits,
    }
    for kind, allowance in allowances.items():
        values[_BOUGHT[kind]] = bought_left(kind)
        values[_BALANCES[kind]] = bought_left(kind) + allowance
    return values


def split_bought(costs: Sequence[int], bought: int) -> list[int]:
    """The bought part of each of `costs`, held together, when `bought` of their sum came from
    bought credits: the first ones take the plan credits, as a spend takes those first."""
    plan_left = sum(costs) - bought
    parts = []
    for cost in costs:
        plan = min(cost, max(plan_left, 0))
        plan_left -= plan
        parts.append(cost - plan)
    return parts
