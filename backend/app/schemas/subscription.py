"""
app/schemas/subscription.py

Pydantic request/response models for the Subscription Management module.
Keeping schemas here isolates the data contract from routing/business logic.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Shared / embedded schemas
# ---------------------------------------------------------------------------

class PlanSummary(BaseModel):
    """Lightweight plan info embedded in subscription rows."""
    plan_key: str
    plan_label: str
    credits_granted: int
    price: float


class SubscriptionRow(BaseModel):
    """
    One row in the Subscription Management table.
    Matches the columns shown in the UI:
      Organisation | Plan | Renews | Credits Available | Total Credits | Status | MRR | Actions
    """
    company_id: str
    company_name: str

    # Plan
    plan_key: str
    plan_label: str

    # Renewal / expiry
    subscription_start: Optional[str] = None
    subscription_expiry: Optional[str] = None          # ISO-8601 string
    days_remaining: Optional[int] = None
    renews_on: Optional[str] = None                    # human-readable date

    # Credits
    credits_available: int = 0                         # current balance
    total_credits: int = 0                             # credits_granted for current plan

    # Status
    status: str = "active"                             # active | expired | trial | blocked
    is_expired: bool = False

    # Financials
    mrr: float = 0.0                                   # Monthly Recurring Revenue in INR

    # Contact
    primary_email: Optional[str] = None
    primary_username: Optional[str] = None
    owner_name: Optional[str] = None          # Full name of the company owner


class SubscriptionListResponse(BaseModel):
    status: str = "success"
    total: int
    data: List[SubscriptionRow]


# ---------------------------------------------------------------------------
# Detail / expand endpoint
# ---------------------------------------------------------------------------

class SubscriptionDetail(SubscriptionRow):
    """Full detail view – includes plan features and recent recharge history."""
    plan_features: List[str] = Field(default_factory=list)
    plan_capabilities: Dict[str, Any] = Field(default_factory=dict)
    recharge_history: List[Dict[str, Any]] = Field(default_factory=list)
    total_sessions: int = 0
    completed_sessions: int = 0


# ---------------------------------------------------------------------------
# Recharge (renew / top-up) request
# ---------------------------------------------------------------------------

class RechargeRequest(BaseModel):
    """
    Body sent by the master admin when recharging a tenant's subscription.

    Fields
    ------
    plan_name       : The new plan key (trial | basic | advance | owner).
                      If omitted the current plan is kept.
    add_credits     : Extra credits to top-up on top of the plan's default grant.
    extend_days     : Extend the subscription window by this many days.
    reset_expiry    : If True, reset expiry to (today + extend_days) instead of
                      extending from the current expiry.
    """
    plan_name: Optional[str] = None
    add_credits: int = Field(default=0, ge=0)
    extend_days: int = Field(default=0, ge=0)
    reset_expiry: bool = False


class RechargeResponse(BaseModel):
    status: str = "success"
    message: str
    company_id: str
    new_plan: str
    new_credits: int
    new_expiry: Optional[str] = None


# ---------------------------------------------------------------------------
# Stats / summary
# ---------------------------------------------------------------------------

class SubscriptionStats(BaseModel):
    """Aggregate KPIs shown at the top of the Subscription Management page."""
    total_organisations: int = 0
    active_subscriptions: int = 0
    expired_subscriptions: int = 0
    trial_subscriptions: int = 0
    total_mrr: float = 0.0                   # sum of all active MRRs
    total_credits_issued: int = 0
    total_credits_consumed: int = 0

# ---------------------------------------------------------------------------
# Razorpay Recharge
# ---------------------------------------------------------------------------

class RazorpayRechargeOrderRequest(BaseModel):
    """Payload to create a Razorpay order for recharging."""
    plan_name: str
    add_credits: int = 0
    extend_days: int = 0
    reset_expiry: bool = False

class RazorpayRechargeVerifyRequest(BaseModel):
    """Payload to verify a Razorpay payment after checkout."""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    # Pass original intent data to apply it upon success
    plan_name: str
    add_credits: int = 0
    extend_days: int = 0
    reset_expiry: bool = False
