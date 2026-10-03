"""Which address a request comes from, for per-IP rate limits.

Browsers reach the API directly and can send any X-Forwarded-For, so it is never trusted on its
own. The web app's server proxies sign-in and sign-up, so every request it makes comes from its
own address; it sends the caller's IP in X-Client-IP together with INTERNAL_PROXY_TOKEN, and only
a request carrying that token has its X-Client-IP believed. Anything else counts by the address
it connected from.
"""

from __future__ import annotations

import hmac
import ipaddress

from fastapi import Request

from app.config import Settings, get_settings
from app.core.observability import get_logger

PROXY_TOKEN_HEADER = "x-internal-proxy-token"
CLIENT_IP_HEADER = "x-client-ip"

_logger = get_logger("studio.client_ip")


def proxied_client_ip(request: Request, token: str | None) -> str | None:
    """The caller's IP the web app's proxy vouches for: only with the right token, compared in
    constant time, and only when it is an IP address."""
    sent = request.headers.get(PROXY_TOKEN_HEADER)
    if not token or sent is None or not hmac.compare_digest(sent.encode(), token.encode()):
        return None
    try:
        return str(ipaddress.ip_address((request.headers.get(CLIENT_IP_HEADER) or "").strip()))
    except ValueError:
        return None


def client_ip(request: Request) -> str:
    proxied = proxied_client_ip(request, get_settings().internal_proxy_token)
    if proxied is not None:
        return proxied
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def warn_if_proxy_token_missing(settings: Settings) -> bool:
    """In production, say once at startup that sign-ins through the web app share one budget
    without INTERNAL_PROXY_TOKEN. Returns whether it warned."""
    if settings.app_env.lower() != "production" or settings.internal_proxy_token:
        return False
    _logger.warning(
        "INTERNAL_PROXY_TOKEN is not set: requests the web app proxies (sign-in, sign-up) count "
        "against its own address, so all of them share one per-IP rate-limit budget."
    )
    return True
