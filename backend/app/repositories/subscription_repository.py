"""
app/repositories/subscription_repository.py

Data-access layer for the Subscription Management module.

All MongoDB queries for subscriptions live here so that:
  - Routes stay thin (just HTTP concerns).
  - Business logic (service layer) is testable without HTTP context.
  - Queries can be optimised in one place without touching routes.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from mongo_db import (
    admins_collection,
    companies_collection,
    interview_sessions_collection,
    payment_orders_collection,
)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _to_str_id(doc: Dict[str, Any]) -> str:
    return str(doc["_id"])


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Read: list
# ---------------------------------------------------------------------------

def list_companies_with_subscription() -> List[Dict[str, Any]]:
    """
    Return all companies with their subscription fields.
    Only fetches the minimal projection needed for the table; call
    get_company_detail() when you need the full expand view.
    """
    projection = {
        "name": 1,
        "subscription_plan": 1,
        "subscription_start": 1,
        "subscription_expiry": 1,
        "credits": 1,
        "created_at": 1,
    }
    return list(companies_collection.find({}, projection))


def get_company_by_id(company_id: str) -> Optional[Dict[str, Any]]:
    try:
        return companies_collection.find_one({"_id": ObjectId(company_id)})
    except Exception:
        return None


def get_primary_admin(company_id: str) -> Optional[Dict[str, Any]]:
    """Return the super_admin user for this company (name, email, username)."""
    return admins_collection.find_one(
        {"company_id": company_id, "role": "super_admin"},
        {"email": 1, "username": 1, "login_enabled": 1, "name": 1, "full_name": 1},
    )


# ---------------------------------------------------------------------------
# Read: session counts (for detail view)
# ---------------------------------------------------------------------------

def get_session_counts(company_id: str) -> Dict[str, int]:
    base = {"company_id": company_id}
    return {
        "total": interview_sessions_collection.count_documents(base),
        "completed": interview_sessions_collection.count_documents(
            {**base, "status": "completed"}
        ),
        "pending": interview_sessions_collection.count_documents(
            {**base, "status": "pending"}
        ),
        "started": interview_sessions_collection.count_documents(
            {**base, "status": "started"}
        ),
    }


# ---------------------------------------------------------------------------
# Read: recharge history
# ---------------------------------------------------------------------------

def get_recharge_history(company_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Return the last `limit` verified payment orders for a company.
    Falls back to an empty list if the company has no payment history.
    """
    cursor = (
        payment_orders_collection.find(
            {"company_id": company_id, "status": "verified"},
            {"order_id": 1, "plan_name": 1, "amount": 1, "created_at": 1, "payment_id": 1},
        )
        .sort("created_at", -1)
        .limit(limit)
    )
    return [
        {
            "order_id": r.get("order_id"),
            "payment_id": r.get("payment_id"),
            "plan_name": r.get("plan_name"),
            "amount": r.get("amount", 0),
            "created_at": r.get("created_at"),
        }
        for r in cursor
    ]


# ---------------------------------------------------------------------------
# Write: recharge / renew
# ---------------------------------------------------------------------------

def apply_recharge(
    company_id: str,
    *,
    new_plan: Optional[str],
    add_credits: int,
    extend_days: int,
    reset_expiry: bool,
    plan_credits_granted: int,
) -> Tuple[str, int, Optional[str]]:
    """
    Atomically update the company document with the new subscription state.

    Returns
    -------
    (final_plan, final_credits, new_expiry_iso)
    """
    company = get_company_by_id(company_id)
    if not company:
        raise ValueError(f"Company {company_id} not found")

    # ── Plan ──────────────────────────────────────────────────────────────
    final_plan = new_plan or company.get("subscription_plan", "trial")

    # ── Credits ────────────────────────────────────────────────────────────
    current_credits: int = company.get("credits", 0)
    if new_plan and new_plan != company.get("subscription_plan"):
        # Changing plan → grant the new plan's full credit allocation
        final_credits = plan_credits_granted + add_credits
    else:
        # Same plan → just top-up on top of existing balance
        final_credits = current_credits + add_credits + (
            plan_credits_granted if add_credits == 0 and extend_days > 0 else 0
        )

    # ── Expiry ─────────────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    new_expiry_iso: Optional[str] = None

    if extend_days > 0:
        if reset_expiry:
            base = now
        else:
            current_expiry_str = company.get("subscription_expiry")
            current_expiry = _parse_iso(current_expiry_str)
            # If already expired, extend from today; otherwise from current expiry
            base = now if (current_expiry is None or current_expiry < now) else current_expiry
        new_expiry = base + timedelta(days=extend_days)
        new_expiry_iso = new_expiry.isoformat()

    # ── Build update document ──────────────────────────────────────────────
    update: Dict[str, Any] = {
        "subscription_plan": final_plan,
        "credits": final_credits,
        "updated_at": now.isoformat(),
    }
    if new_expiry_iso:
        update["subscription_expiry"] = new_expiry_iso
    if not company.get("subscription_start"):
        update["subscription_start"] = now.isoformat()

    companies_collection.update_one(
        {"_id": ObjectId(company_id)},
        {"$set": update},
    )

    return final_plan, final_credits, new_expiry_iso


# ---------------------------------------------------------------------------
# Aggregate: total credits consumed
# ---------------------------------------------------------------------------

def get_total_credits_consumed(company_id: str) -> int:
    """
    Sum the credits consumed across all completed sessions for this company.
    Each completed session costs 1 credit by convention.
    """
    return interview_sessions_collection.count_documents(
        {"company_id": company_id, "status": "completed"}
    )
