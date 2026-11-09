"""
backend/app/services/firebase_auth_service.py

Unified Firebase Auth service implementing the 3 safety rules:
1. Reconcile existing accounts (Rule 1: EmailAlreadyExistsError recovery).
2. Safe rollbacks for atomic tenant/admin creation (Rule 2: Atomicity & Rollback).
3. Synchronize passwords between MongoDB and Firebase Auth (Rule 3: Password Synchronization).
"""

import logging
from typing import Optional, Tuple
import firebase_admin
from firebase_admin import auth as firebase_auth_admin
from app.db.database import admins_collection
from app.core.config import init_firebase_admin

logger = logging.getLogger(__name__)

# Ensure Firebase Admin SDK is initialized
init_firebase_admin()


def provision_firebase_user(
    email: str,
    password: str,
    display_name: Optional[str] = None,
) -> Tuple[firebase_auth_admin.UserRecord, bool]:
    """
    Rule 1: Create a user in Firebase Auth.
    If the email already exists in Firebase Auth, recovers the user and synchronizes their password.
    Returns:
        tuple (firebase_user, is_newly_created)
    """
    clean_email = (email or "").strip().lower()
    if not clean_email:
        raise ValueError("Email cannot be empty for Firebase provisioning")

    try:
        user = firebase_auth_admin.create_user(
            email=clean_email,
            password=password,
            display_name=display_name or clean_email,
            disabled=False,
            email_verified=True,
        )
        logger.info(f"Successfully created Firebase user {clean_email} (UID: {user.uid})")
        return user, True

    except Exception as exc:
        err_msg = str(exc).lower()

        # Handle duplicate email scenarios (EmailAlreadyExistsError)
        if "already exists" in err_msg or "email_exists" in err_msg:
            logger.info(f"Firebase account {clean_email} already exists. Reconciling and syncing password.")
            try:
                user = firebase_auth_admin.get_user_by_email(clean_email)
                firebase_auth_admin.update_user(
                    user.uid,
                    password=password,
                    disabled=False,
                    email_verified=True,
                )
                logger.info(f"Reconciled existing Firebase user {clean_email} (UID: {user.uid}) with new password.")
                return user, False
            except Exception as sync_err:
                logger.error(f"Failed to reconcile existing Firebase user {clean_email}: {sync_err}")
                raise RuntimeError(f"Failed to reconcile existing Firebase user: {sync_err}") from sync_err

        logger.error(f"Failed to create Firebase user {clean_email}: {exc}")
        raise exc


def rollback_firebase_user(uid: Optional[str]) -> None:
    """
    Rule 2: Safely deletes a newly created Firebase user during rollback if subsequent database writes fail.
    """
    if not uid:
        return
    try:
        firebase_auth_admin.delete_user(uid)
        logger.info(f"Successfully rolled back and deleted Firebase user UID: {uid}")
    except Exception as exc:
        logger.warning(f"Failed to rollback Firebase user UID {uid}: {exc}")


def sync_firebase_password(admin_doc: dict, new_password: str) -> None:
    """
    Rule 3: Keeps Firebase Auth password in lockstep with MongoDB bcrypt.
    Also auto-provisions or links Firebase if a legacy account is resetting their password!
    """
    if not admin_doc or not new_password:
        return

    firebase_uid = admin_doc.get("firebase_uid")
    email = (admin_doc.get("email") or "").strip().lower()

    if not email and not firebase_uid:
        return

    try:
        # A. If UID is present, update password directly
        if firebase_uid:
            try:
                firebase_auth_admin.update_user(firebase_uid, password=new_password)
                logger.info(f"Synced updated password to Firebase for UID {firebase_uid}")
                return
            except Exception as uid_err:
                logger.warning(f"Updating Firebase user by UID {firebase_uid} failed ({uid_err}); trying email fallback...")

        # B. If UID is missing or was stale, locate or create user by email
        if email:
            fb_user = None
            try:
                fb_user = firebase_auth_admin.get_user_by_email(email)
                firebase_auth_admin.update_user(fb_user.uid, password=new_password)
                logger.info(f"Updated password for existing Firebase user {email}")
            except Exception:
                # If user doesn't exist in Firebase yet, auto-provision on password reset!
                try:
                    fb_user = firebase_auth_admin.create_user(
                        email=email,
                        password=new_password,
                        display_name=admin_doc.get("name") or admin_doc.get("username") or email,
                        disabled=False,
                        email_verified=True,
                    )
                    logger.info(f"Auto-provisioned Firebase user for legacy admin {email} during password change")
                except Exception as create_err:
                    logger.warning(f"Auto-provisioning Firebase user for {email} failed: {create_err}")

            if fb_user and admin_doc.get("_id"):
                admins_collection.update_one(
                    {"_id": admin_doc["_id"]},
                    {"$set": {"firebase_uid": fb_user.uid, "firebase_email": fb_user.email}}
                )

    except Exception as exc:
        logger.warning(f"Error syncing password to Firebase for {email}: {exc}")
