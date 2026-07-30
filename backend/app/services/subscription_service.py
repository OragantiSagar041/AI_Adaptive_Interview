"""
app/service_layer/subscription_service.py

Pure business logic for the Subscription Management module.

Responsibilities
----------------
- Aggregate raw company + plan data into the rich SubscriptionRow shape.
- Compute MRR, status labels, credit summaries, etc.
- Orchestrate recharge operations through the repository layer.

This layer has no HTTP awareness (no Request, no HTTPException).
Callers (routes) are responsible for translating exceptions into HTTP responses.
"""
from __future__ import annotations


from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import PLAN_DEFINITIONS
from app.repositories.subscription_repository import (
    apply_recharge,
    get_company_by_id,
    get_primary_admin,
    get_recharge_history,
    get_session_counts,
    get_total_credits_consumed,
    list_companies_with_subscription,
)
from app.schemas.subscription import (
    RechargeResponse,
    SubscriptionDetail,
    SubscriptionListResponse,
    SubscriptionRow,
    SubscriptionStats,
)
from app.services.services import (
    get_admin_plan_context,
    get_plan_definition,
    normalize_plan_key,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _format_date(value: Optional[Any]) -> Optional[str]:
    """Return a human-readable date like '12 Aug 2025' or None."""
    if isinstance(value, datetime):
        dt = value
    else:
        dt = _parse_iso(str(value)) if value else None
        
    if not dt:
        return None
        
    # Use %d instead of %-d to prevent ValueError: Invalid format string on Windows
    return dt.strftime("%d %b %Y") if hasattr(dt, "strftime") else str(dt.date())


def _compute_mrr(plan_key: str, is_active: bool) -> float:
    """
    Monthly Recurring Revenue for this subscription.
    """
    if not is_active:
        return 0.0
    plan = PLAN_DEFINITIONS.get(plan_key, {})
    return float(plan.get("price", 0))


def _compute_status(
    plan_key: str,
    is_expired: bool,
    login_enabled: bool,
) -> str:
    if not login_enabled:
        return "blocked"
    if is_expired:
        return "expired"
    if plan_key == "trial":
        return "trial"
    return "active"


# ---------------------------------------------------------------------------
# Build a single SubscriptionRow from raw MongoDB docs
# ---------------------------------------------------------------------------

def _build_row(company: Dict[str, Any]) -> SubscriptionRow:
    company_id = str(company["_id"])

    # ── Plan context (handles expiry, days_remaining, warnings) ───────────
    mock_user = {"company_id": company_id}
    ctx = get_admin_plan_context(mock_user)
    plan_key: str = ctx.get("plan_key", "trial")
    plan_def = get_plan_definition(plan_key)

    # ── Primary admin ──────────────────────────────────────────────────────
    admin = get_primary_admin(company_id) or {}
    login_enabled = admin.get("login_enabled", True)

    # ── Credits ────────────────────────────────────────────────────────────
    credits_available: int = max(0, company.get("credits", 0))
    plan_default_credits: int = plan_def.get("credits_granted", 0)
    # total_credits is the high-water mark: the larger of plan default and
    # what the company currently holds (extra top-ups can exceed plan default)
    total_credits: int = max(plan_default_credits, credits_available)

    # ── Status ─────────────────────────────────────────────────────────────
    is_expired: bool = ctx.get("is_expired", False)
    status = _compute_status(plan_key, is_expired, login_enabled)

    # ── MRR ────────────────────────────────────────────────────────────────
    mrr = _compute_mrr(plan_key, status == "active")

    return SubscriptionRow(
        company_id=company_id,
        company_name=company.get("name", "Unknown"),
        plan_key=plan_key,
        plan_label=ctx.get("plan_label", plan_def.get("label", plan_key)),
        subscription_start=company.get("subscription_start"),
        subscription_expiry=company.get("subscription_expiry"),
        days_remaining=ctx.get("days_remaining"),
        renews_on=_format_date(company.get("subscription_expiry")),
        credits_available=credits_available,
        total_credits=total_credits,
        status=status,
        is_expired=is_expired,
        mrr=mrr,
        primary_email=admin.get("email"),
        primary_username=admin.get("username"),
        owner_name=admin.get("name") or admin.get("full_name") or admin.get("username"),
    )


# ---------------------------------------------------------------------------
# Public API: list
# ---------------------------------------------------------------------------

def list_subscriptions() -> SubscriptionListResponse:
    """
    Return all organisation subscriptions for the master admin table.
    Complexity: O(n) — one extra admin lookup per company.
    For large datasets (n > 500) this should be replaced with an aggregation pipeline.
    """
    companies = list_companies_with_subscription()
    rows = [_build_row(c) for c in companies]
    return SubscriptionListResponse(total=len(rows), data=rows)


# ---------------------------------------------------------------------------
# Public API: detail / expand
# ---------------------------------------------------------------------------

def get_subscription_detail(company_id: str) -> SubscriptionDetail:
    """
    Return the full detail view for one organisation (for the expand / side panel).
    """
    company = get_company_by_id(company_id)
    if not company:
        raise ValueError(f"Company '{company_id}' not found")

    row = _build_row(company)
    plan_def = get_plan_definition(row.plan_key)

    session_counts = get_session_counts(company_id)
    recharge_history = get_recharge_history(company_id, limit=10)

    return SubscriptionDetail(
        **row.model_dump(),
        plan_features=plan_def.get("features", []),
        plan_capabilities=plan_def.get("capabilities", {}),
        recharge_history=recharge_history,
        total_sessions=session_counts["total"],
        completed_sessions=session_counts["completed"],
    )


# ---------------------------------------------------------------------------
# Public API: aggregate stats
# ---------------------------------------------------------------------------

def get_subscription_stats() -> SubscriptionStats:
    """
    Compute dashboard KPIs in a single pass over all companies.
    """
    companies = list_companies_with_subscription()

    total = len(companies)
    active = expired = trial = 0
    total_mrr = 0.0
    total_credits_issued = 0
    total_credits_consumed = 0

    for company in companies:
        company_id = str(company["_id"])
        mock_user = {"company_id": company_id}
        ctx = get_admin_plan_context(mock_user)
        plan_key = ctx.get("plan_key", "trial")
        is_expired = ctx.get("is_expired", False)

        admin = get_primary_admin(company_id) or {}
        login_enabled = admin.get("login_enabled", True)
        status = _compute_status(plan_key, is_expired, login_enabled)

        if status == "active":
            active += 1
            total_mrr += _compute_mrr(plan_key, True)
        elif status == "expired":
            expired += 1
        elif status == "trial":
            trial += 1

        plan_def = get_plan_definition(plan_key)
        total_credits_issued += plan_def.get("credits_granted", 0)
        total_credits_consumed += get_total_credits_consumed(company_id)

    return SubscriptionStats(
        total_organisations=total,
        active_subscriptions=active,
        expired_subscriptions=expired,
        trial_subscriptions=trial,
        total_mrr=round(total_mrr, 2),
        total_credits_issued=total_credits_issued,
        total_credits_consumed=total_credits_consumed,
    )


# ---------------------------------------------------------------------------
# Public API: recharge / renew
# ---------------------------------------------------------------------------

def recharge_subscription(
    company_id: str,
    plan_name: Optional[str],
    add_credits: int,
    extend_days: int,
    reset_expiry: bool,
) -> RechargeResponse:
    """
    Apply a plan change and/or credit top-up to a company subscription.

    Rules
    -----
    - If plan_name changes → grant the new plan's default credits + add_credits.
    - If plan_name is unchanged → only top-up with add_credits.
    - If extend_days > 0 → extend the expiry window (from today if reset_expiry
      is True, or from the current expiry otherwise).
    """
    # Validate plan
    final_plan_key = normalize_plan_key(plan_name) if plan_name else None
    plan_def = get_plan_definition(final_plan_key or "trial")
    credits_granted = plan_def.get("credits_granted", 0)

    final_plan, final_credits, new_expiry = apply_recharge(
        company_id,
        new_plan=final_plan_key,
        add_credits=add_credits,
        extend_days=extend_days,
        reset_expiry=reset_expiry,
        plan_credits_granted=credits_granted,
    )

    plan_label = PLAN_DEFINITIONS.get(final_plan, {}).get("label", final_plan)
    msg_parts = []
    if plan_name:
        msg_parts.append(f"Plan updated to '{plan_label}'")
    if add_credits > 0:
        msg_parts.append(f"{add_credits} credits added")
    if new_expiry:
        msg_parts.append(f"subscription extended to {_format_date(new_expiry)}")
    message = ". ".join(msg_parts) + "." if msg_parts else "No changes applied."

    return RechargeResponse(
        company_id=company_id,
        new_plan=final_plan,
        new_credits=final_credits,
        new_expiry=new_expiry,
        message=message,
    )
