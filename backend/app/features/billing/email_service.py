"""Billing receipt and subscription lifecycle emails."""

from __future__ import annotations

from app.features.auth.email_service import send_email


def send_payment_receipt_email(
    *,
    to: str,
    plan_label: str,
    amount_label: str,
    invoice_url: str | None = None,
) -> None:
    subject = f"DevJewels Studio — payment received ({plan_label})"
    lines = [
        f"Thank you for your payment of {amount_label} for the {plan_label} plan.",
        "",
        "Your credits have been updated and are ready to use in your workshop.",
    ]
    if invoice_url:
        lines.extend(["", f"View invoice: {invoice_url}"])
    body_text = "\n".join(lines)
    body_html = "<p>" + "</p><p>".join(lines) + "</p>"
    send_email(to=to, subject=subject, body_text=body_text, body_html=body_html)


def send_subscription_updated_email(
    *,
    to: str,
    plan_label: str,
    action: str,
) -> None:
    subject = f"DevJewels Studio — subscription {action}"
    body_text = (
        f"Your DevJewels Studio subscription has been {action}.\n\n"
        f"Current plan: {plan_label}\n\n"
        f"Manage billing anytime from your profile page."
    )
    send_email(to=to, subject=subject, body_text=body_text)
