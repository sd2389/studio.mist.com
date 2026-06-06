"""Transactional email — SMTP when configured, console fallback for local dev."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

logger = logging.getLogger(__name__)


def send_email(*, to: str, subject: str, body_text: str, body_html: str | None = None) -> None:
    settings = get_settings()
    if settings.smtp_host:
        _send_smtp(
            host=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_username,
            password=settings.smtp_password,
            use_tls=settings.smtp_use_tls,
            from_addr=settings.email_from,
            to=to,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
        )
        return
    logger.info(
        "Email (console fallback)\n  To: %s\n  Subject: %s\n  Body:\n%s",
        to,
        subject,
        body_text,
    )


def _send_smtp(
    *,
    host: str,
    port: int,
    username: str | None,
    password: str | None,
    use_tls: bool,
    from_addr: str,
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None,
) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")

    if use_tls:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls()
            if username and password:
                smtp.login(username, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            if username and password:
                smtp.login(username, password)
            smtp.send_message(msg)


def send_password_reset_email(*, to: str, reset_url: str) -> None:
    subject = "Reset your DevJewels Studio password"
    body_text = (
        f"Use the link below to reset your password. It expires in 24 hours.\n\n"
        f"{reset_url}\n\n"
        f"If you did not request this, you can ignore this email."
    )
    body_html = (
        f"<p>Use the link below to reset your password. It expires in 24 hours.</p>"
        f'<p><a href="{reset_url}">{reset_url}</a></p>'
        f"<p>If you did not request this, you can ignore this email.</p>"
    )
    send_email(to=to, subject=subject, body_text=body_text, body_html=body_html)


def send_contact_notification(*, name: str, email: str, message: str) -> None:
    settings = get_settings()
    to = settings.contact_notify_email or settings.email_from
    subject = f"Contact form: {name}"
    body_text = f"From: {name} <{email}>\n\n{message}"
    send_email(to=to, subject=subject, body_text=body_text)
