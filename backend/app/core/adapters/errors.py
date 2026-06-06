"""Typed errors for external adapters (storage, email, Stripe, AI)."""

from __future__ import annotations


class AdapterError(Exception):
    """Base error for external dependency failures."""

    dependency: str = "unknown"

    def __init__(self, message: str, *, cause: Exception | None = None) -> None:
        super().__init__(message)
        self.cause = cause


class StorageAdapterError(AdapterError):
    dependency = "storage"


class EmailAdapterError(AdapterError):
    dependency = "email"


class StripeAdapterError(AdapterError):
    dependency = "stripe"


class AiAdapterError(AdapterError):
    dependency = "ai"


class AdapterTimeoutError(AdapterError):
    """Raised when an external call exceeds its timeout budget."""
