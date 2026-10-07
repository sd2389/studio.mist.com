from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.scene import Base

if TYPE_CHECKING:
    from app.models.user import User


class UserBilling(Base):
    """A customer's plan and credits. Each *_balance is what they can spend: the plan's credits
    for the period plus credits they bought (features/billing/credit_pools.py)."""

    __tablename__ = "user_billing"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True
    )
    plan_tier: Mapped[str] = mapped_column(String(32), default="free")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    model_credits_balance: Mapped[int] = mapped_column(Integer, default=0)
    ai_image_credits_balance: Mapped[int] = mapped_column(Integer, default=0)
    render_credits_balance: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    custom_material_credits_balance: Mapped[int] = mapped_column(Integer, default=0)
    custom_asset_credits_balance: Mapped[int] = mapped_column(Integer, default=0)
    # How many of the balance's credits were bought (top-ups, and refunds of them) when it last
    # grew. Spending takes plan credits first and leaves these alone, so the bought credits left
    # are min(bought_*, balance): read them with credit_pools.bought_credits.
    bought_model_credits: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    bought_ai_image_credits: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    bought_render_credits: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # The allowance the plan credits were last set from: "free", or a Stripe subscription's
    # "<subscription>|<period start>|<tier>". A paid checkout or invoice.paid grants a period's
    # allowance only when this changes. NULL: none recorded yet.
    allowance_granted_for: Mapped[str | None] = mapped_column(String(320), nullable=True)
    # Counts each time an allowance replaces the plan credits (a grant or a reset). A hold keeps
    # the count it was made at; its refund gives plan credits back only while it is unchanged.
    allowance_generation: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    storage_bytes_used: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="billing")


class BillingEvent(Base):
    """Idempotent Stripe webhook processing ledger."""

    __tablename__ = "billing_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    stripe_event_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(128))
    processed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CreditAdjustment(Base):
    """Admin audit ledger for manual credit grants, refunds, and comps."""

    __tablename__ = "credit_adjustments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    admin_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    target_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(32))
    delta: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CreditPurchase(Base):
    """Paid top-up ledger: one row per Stripe Checkout Session that added credits."""

    __tablename__ = "credit_purchases"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # The top-up kind from the session metadata: "ai" or "model".
    kind: Mapped[str] = mapped_column(String(32))
    credits: Mapped[int] = mapped_column(Integer)
    stripe_checkout_session_id: Mapped[str] = mapped_column(String(255), unique=True)
    stripe_event_id: Mapped[str] = mapped_column(String(255))
    # What Stripe charged, in the currency's smallest unit (cents for USD), when it says.
    amount_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
