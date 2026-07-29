"""
app/routes_subscription.py

FastAPI router for the Subscription Management module.

Route map
---------
GET  /master/subscriptions              → list all organisations
GET  /master/subscriptions/stats        → aggregate KPI stats
GET  /master/subscriptions/{company_id} → full detail for one org
POST /master/subscriptions/{company_id}/recharge
                                        → recharge credits / renew plan

All routes require master-admin authentication.
"""
from __future__ import annotations


from fastapi import APIRouter, Depends, HTTPException

from app.schemas.subscription import (
    RechargeRequest,
    RechargeResponse,
    SubscriptionDetail,
    SubscriptionListResponse,
    SubscriptionStats,
    RazorpayRechargeOrderRequest,
    RazorpayRechargeVerifyRequest,
)
from app.service_layer.subscription_service import (
    get_subscription_detail,
    get_subscription_stats,
    list_subscriptions,
    recharge_subscription,
)

# Auth guards are defined in services.py
from app.services import get_current_admin, require_master_user

router = APIRouter(prefix="/master/subscriptions", tags=["Subscription Management"])


# ---------------------------------------------------------------------------
# GET /master/subscriptions/stats   ← must be declared BEFORE /{company_id}
# ---------------------------------------------------------------------------

@router.get(
    "/stats",
    response_model=SubscriptionStats,
    summary="Get subscription KPI summary",
    description=(
        "Returns aggregate stats (total orgs, active / expired / trial counts, "
        "total MRR, credits issued / consumed). Requires master-admin token."
    ),
)
def subscription_stats(master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
    try:
        return get_subscription_stats()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# GET /master/subscriptions
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=SubscriptionListResponse,
    summary="List all organisation subscriptions",
    description=(
        "Returns the full subscription table including Organisation, Plan, "
        "Renews, Credits Available, Total Credits, Status, MRR, and Actions metadata. "
        "Requires master-admin token."
    ),
)
def list_all_subscriptions(master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
    try:
        return list_subscriptions()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# GET /master/subscriptions/{company_id}
# ---------------------------------------------------------------------------

@router.get(
    "/{company_id}",
    response_model=SubscriptionDetail,
    summary="Get full subscription detail for one organisation",
    description=(
        "Returns the expanded view for a single organisation: plan features, "
        "capabilities, recharge history, and session counts. "
        "Requires master-admin token."
    ),
)
def get_one_subscription(
    company_id: str,
    master_id: str = Depends(get_current_admin),
):
    require_master_user(master_id)
    try:
        return get_subscription_detail(company_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# POST /master/subscriptions/{company_id}/recharge
# ---------------------------------------------------------------------------

@router.post(
    "/{company_id}/recharge",
    response_model=RechargeResponse,
    summary="Recharge a subscription (change plan, add credits, extend expiry)",
    description=(
        "Allows the master admin to:\n"
        "- Change the organisation's plan (`plan_name`).\n"
        "- Top-up credits (`add_credits`).\n"
        "- Extend the subscription window (`extend_days`).\n"
        "- Hard-reset expiry from today (`reset_expiry=true`).\n\n"
        "All fields are optional; supply only what you want to change. "
        "Requires master-admin token."
    ),
)
def recharge_company_subscription(
    company_id: str,
    body: RechargeRequest,
    master_id: str = Depends(get_current_admin),
):
    require_master_user(master_id)

    # At least one change must be requested
    if not body.plan_name and body.add_credits == 0 and body.extend_days == 0:
        raise HTTPException(
            status_code=422,
            detail="Supply at least one of: plan_name, add_credits, or extend_days.",
        )

    try:
        return recharge_subscription(
            company_id=company_id,
            plan_name=body.plan_name,
            add_credits=body.add_credits,
            extend_days=body.extend_days,
            reset_expiry=body.reset_expiry,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ===========================================================================
# SUPERADMIN ROUTES (Self-serve)
# ===========================================================================
from app.services import get_current_admin_details

router_superadmin = APIRouter(prefix="/superadmin/subscriptions", tags=["Subscription Management (SuperAdmin)"])

@router_superadmin.get("/stats", response_model=SubscriptionStats)
def superadmin_subscription_stats(admin_details: dict = Depends(get_current_admin_details)):
    # Calculate stats for just this one company
    company_id = str(admin_details["company_id"])
    try:
        detail = get_subscription_detail(company_id)
        return SubscriptionStats(
            total_organisations=1,
            active_subscriptions=1 if detail.status == "active" else 0,
            expired_subscriptions=1 if detail.status == "expired" else 0,
            trial_subscriptions=1 if detail.status == "trial" else 0,
            total_mrr=detail.mrr,
            total_credits_issued=detail.total_credits,
            total_credits_consumed=detail.total_sessions,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@router_superadmin.get("", response_model=SubscriptionListResponse)
def superadmin_list_subscription(admin_details: dict = Depends(get_current_admin_details)):
    company_id = str(admin_details["company_id"])
    try:
        from app.repositories.subscription_repository import get_company_by_id
        from app.service_layer.subscription_service import _build_row
        company = get_company_by_id(company_id)
        if not company:
            return SubscriptionListResponse(total=0, data=[])
        row = _build_row(company)
        return SubscriptionListResponse(total=1, data=[row])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@router_superadmin.get("/{company_id}", response_model=SubscriptionDetail)
def superadmin_get_one_subscription(
    company_id: str,
    admin_details: dict = Depends(get_current_admin_details),
):
    if company_id != str(admin_details["company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        return get_subscription_detail(company_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@router_superadmin.post("/{company_id}/recharge", response_model=RechargeResponse)
def superadmin_recharge_subscription(
    company_id: str,
    body: RechargeRequest,
    admin_details: dict = Depends(get_current_admin_details),
):
    if company_id != str(admin_details["company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")
        
    if not body.plan_name and body.add_credits == 0 and body.extend_days == 0:
        raise HTTPException(
            status_code=422,
            detail="Supply at least one of: plan_name, add_credits, or extend_days.",
        )

    try:
        return recharge_subscription(
            company_id=company_id,
            plan_name=body.plan_name,
            add_credits=body.add_credits,
            extend_days=body.extend_days,
            reset_expiry=body.reset_expiry,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

# ---------------------------------------------------------------------------
# Razorpay Integrations
# ---------------------------------------------------------------------------
import os
import time
import uuid
import hmac
import requests
from datetime import datetime, timezone
from app.routes import get_razorpay_credentials
from app.database import payment_orders_collection
from app.config import PLAN_DEFINITIONS

@router_superadmin.post("/{company_id}/razorpay-order")
def superadmin_razorpay_order(
    company_id: str,
    body: RazorpayRechargeOrderRequest,
    admin_details: dict = Depends(get_current_admin_details),
):
    if company_id != str(admin_details["company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    key_id, key_secret = get_razorpay_credentials()
    
    plan = PLAN_DEFINITIONS.get(body.plan_name, {})
    price = int(plan.get("price", 0))
    if price <= 0:
        raise HTTPException(status_code=400, detail="This plan does not require payment")

    receipt = f"rech_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    payload = {
        "amount": price * 100,
        "currency": "INR",
        "receipt": receipt[:40],
        "notes": {
            "company_id": company_id,
            "plan_name": body.plan_name,
            "add_credits": body.add_credits,
            "extend_days": body.extend_days,
            "reset_expiry": body.reset_expiry,
        }
    }

    try:
        resp = requests.post(
            "https://api.razorpay.com/v1/orders",
            json=payload,
            auth=(key_id, key_secret),
            timeout=10,
        )
        resp.raise_for_status()
        order_data = resp.json()
    except requests.RequestException as exc:
        error_message = exc.response.text if exc.response else str(exc)
        raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {error_message}")

    # Store intent in DB
    payment_orders_collection.insert_one({
        "order_id": order_data["id"],
        "company_id": company_id,
        "type": "recharge",
        "amount": price * 100,
        "status": "created",
        "created_at": datetime.now(timezone.utc),
        "intent_payload": body.dict()
    })

    return {
        "order_id": order_data["id"],
        "key_id": key_id,
        "amount": price * 100,
        "currency": "INR",
    }

@router_superadmin.post("/{company_id}/razorpay-verify")
def superadmin_razorpay_verify(
    company_id: str,
    body: RazorpayRechargeVerifyRequest,
    admin_details: dict = Depends(get_current_admin_details),
):
    if company_id != str(admin_details["company_id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    key_id, key_secret = get_razorpay_credentials()

    # Verify signature
    signature_payload = f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        signature_payload,
        "sha256"
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    # Check order in DB
    order_record = payment_orders_collection.find_one({"order_id": body.razorpay_order_id})
    if not order_record:
        raise HTTPException(status_code=404, detail="Order not found")
        
    if order_record.get("status") == "verified":
        raise HTTPException(status_code=400, detail="Payment already verified")

    # Update order status
    payment_orders_collection.update_one(
        {"order_id": body.razorpay_order_id},
        {"$set": {
            "status": "verified",
            "payment_id": body.razorpay_payment_id,
            "verified_at": datetime.now(timezone.utc)
        }}
    )

    # Actually apply the recharge
    try:
        res = recharge_subscription(
            company_id=company_id,
            plan_name=body.plan_name,
            add_credits=body.add_credits,
            extend_days=body.extend_days,
            reset_expiry=body.reset_expiry,
        )
        return res
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Payment verified but failed to apply recharge: {exc}")
