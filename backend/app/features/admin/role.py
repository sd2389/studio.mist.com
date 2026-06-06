"""Admin helpers — role promotion from configured admin emails."""

from app.config import get_settings


def admin_email_set() -> set[str]:
    raw = get_settings().admin_emails.strip()
    if not raw:
        return set()
    return {email.strip().lower() for email in raw.split(",") if email.strip()}


def is_admin_email(email: str) -> bool:
    return email.strip().lower() in admin_email_set()


def maybe_promote_admin(user) -> None:
    """Set role=admin when email matches ADMIN_EMAILS (does not commit)."""
    if user.role != "admin" and is_admin_email(user.email):
        user.role = "admin"
