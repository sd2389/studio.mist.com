"""CLI: lower old Free AI image credit balances to the Free allowance in plans.py.

Free accounts used to get 150 AI image credits. Each Free account above today's allowance
keeps the allowance plus the AI credits it paid for (purchase ledger and Stripe Checkout)
or an admin granted it. No balance goes up. Dry run unless --apply.

Usage (from backend/, or in the backend container):
    python -m scripts.reset_free_ai_credits                        # dry run: change nothing
    python -m scripts.reset_free_ai_credits --apply --admin-id 1   # write it, audited as admin 1
    python -m scripts.reset_free_ai_credits --no-stripe            # ledger and grants only
"""

from __future__ import annotations

import argparse
import sys

import stripe

from app.config import get_settings
from app.database import SessionLocal
from app.features.billing.free_ai_credit_reset import (
    AUDIT_KIND,
    AiCreditReset,
    apply_free_ai_reset,
    free_ai_allowance,
    plan_free_ai_reset,
    require_admin,
)

ROW = "{:>8}  {:<6}  {:>8}  {:>8}  {:>8}  {:>8}"


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.reset_free_ai_credits",
        description=(
            "Lower old Free AI image credit balances to the Free allowance, keeping paid and "
            "admin-granted credits. Dry run unless --apply."
        ),
    )
    parser.add_argument("--apply", action="store_true", help="write the new balances")
    parser.add_argument(
        "--admin-id",
        type=int,
        help="admin user the audit rows are recorded under (needed with --apply)",
    )
    parser.add_argument(
        "--no-stripe",
        action="store_true",
        help="do not look up top-ups in Stripe: paid credits come from the purchase ledger only",
    )
    args = parser.parse_args(argv)
    if args.apply and args.admin_id is None:
        parser.error("--apply needs --admin-id")
    return args


def build_stripe_client(secret_key: str) -> stripe.StripeClient:
    return stripe.StripeClient(secret_key, max_network_retries=2)


def stripe_key_mode(secret_key: str) -> str:
    """live or test, read from the key's prefix (sk_live_, rk_test_, ...); never prints the key."""
    for mode in ("live", "test"):
        if f"_{mode}_" in secret_key:
            return mode
    return "unknown"


def describe_stripe_source(secret_key: str | None) -> str:
    if secret_key is None:
        return (
            "Stripe: not checked (--no-stripe). Paid credits come from the purchase ledger only, "
            "so AI top-ups bought before it existed are not counted."
        )
    return (
        f"Stripe: paid AI top-up Checkout Sessions counted ({stripe_key_mode(secret_key)} mode), "
        "with the purchase ledger."
    )


def format_table(resets: list[AiCreditReset]) -> list[str]:
    lines = [ROW.format("user_id", "plan", "current", "paid", "granted", "new")]
    for reset in resets:
        lines.append(
            ROW.format(
                reset.user_id, reset.plan_tier, reset.current, reset.paid, reset.granted, reset.new
            )
        )
    lines.append(
        ROW.format(
            "total",
            "",
            sum(reset.current for reset in resets),
            sum(reset.paid for reset in resets),
            sum(reset.granted for reset in resets),
            sum(reset.new for reset in resets),
        )
    )
    return lines


def credits_removed(resets: list[AiCreditReset]) -> int:
    return sum(reset.current - reset.new for reset in resets)


def print_plan(resets: list[AiCreditReset], stripe_source: str) -> None:
    allowance = free_ai_allowance()
    lowered = [reset for reset in resets if reset.new < reset.current]
    print(f"Free AI image allowance: {allowance} credits (plans.py)")
    print(stripe_source)
    print("Admin grants: positive AI credit adjustments are kept.")
    print()
    print("\n".join(format_table(resets)))
    print()
    print(
        f"{len(resets)} Free accounts above {allowance} AI credits; {len(lowered)} to lower, "
        f"by {credits_removed(lowered)} credits in all."
    )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    secret_key = get_settings().stripe_secret_key
    if not secret_key and not args.no_stripe:
        print(
            "Refusing to run: Stripe is not configured (STRIPE_SECRET_KEY), so AI top-ups bought "
            "before the purchase ledger existed cannot be found. Configure Stripe, or pass "
            "--no-stripe to count only the ledger and admin grants.",
            file=sys.stderr,
        )
        return 1
    stripe_key = None if args.no_stripe else secret_key
    stripe_client = build_stripe_client(stripe_key) if stripe_key else None

    with SessionLocal() as db:
        try:
            if args.admin_id is not None:
                require_admin(db, args.admin_id)
            resets = plan_free_ai_reset(db, stripe_client)
        except ValueError as exc:
            print(f"Refusing to run: {exc}", file=sys.stderr)
            return 1
        except stripe.StripeError as exc:
            print(f"Stripe lookup failed; nothing was changed: {exc}", file=sys.stderr)
            return 1
        print_plan(resets, describe_stripe_source(stripe_key))

        if not args.apply:
            print("Dry run: nothing was changed. To write it: --apply --admin-id <admin user id>")
            return 0
        applied = apply_free_ai_reset(db, resets, admin_user_id=args.admin_id)

    print(
        f"Applied: lowered {len(applied)} balances by {credits_removed(applied)} credits and wrote "
        f"{len(applied)} credit_adjustments rows (kind {AUDIT_KIND}, admin {args.admin_id})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
