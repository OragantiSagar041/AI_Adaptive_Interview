import os
import threading
import logging
import json

logger = logging.getLogger(__name__)

class CloudinaryManager:
    def __init__(self):
        self._all_accounts = []
        self._disabled_accounts = set()
        self.current_index = 0
        self.lock = threading.Lock()
        self._load_accounts()
        self._sync_global_config()

    def _load_accounts(self):
        accounts_str = os.getenv("CLOUDINARY_ACCOUNTS")
        if accounts_str:
            try:
                accounts = json.loads(accounts_str)
                if isinstance(accounts, list):
                    clean_accounts = []
                    for acc in accounts:
                        if isinstance(acc, dict):
                            clean_acc = {
                                "cloud_name": str(acc.get("cloud_name") or "").strip(),
                                "api_key": str(acc.get("api_key") or "").strip(),
                                "api_secret": str(acc.get("api_secret") or "").strip(),
                            }
                            if all(clean_acc.values()):
                                clean_accounts.append(clean_acc)
                    self._all_accounts = clean_accounts
            except Exception as e:
                logger.error(f"Failed to parse CLOUDINARY_ACCOUNTS JSON: {e}")

        default_account = {
            "cloud_name": (os.getenv("CLOUDINARY_CLOUD_NAME") or "").strip(),
            "api_key": (os.getenv("CLOUDINARY_API_KEY") or "").strip(),
            "api_secret": (os.getenv("CLOUDINARY_API_SECRET") or "").strip(),
        }
        
        if all(default_account.values()):
            if not any(acc.get("api_key") == default_account["api_key"] for acc in self._all_accounts):
                self._all_accounts.append(default_account)

    def _sync_global_config(self):
        """Keep global cloudinary.config pointing to a valid active account for bare upload calls."""
        active = self.get_all_accounts()
        if active:
            try:
                import cloudinary
                first = active[0]
                cloudinary.config(
                    cloud_name=first["cloud_name"],
                    api_key=first["api_key"],
                    api_secret=first["api_secret"],
                    secure=True
                )
                logger.info(f"[CloudinaryManager] Synced global Cloudinary config to account: {first['cloud_name']}")
            except Exception as e:
                logger.warning(f"[CloudinaryManager] Failed to sync global Cloudinary config: {e}")

    def mark_account_disabled(self, cloud_name: str, reason: str = ""):
        with self.lock:
            self._disabled_accounts.add(cloud_name)
            logger.error(f"Marked Cloudinary account {cloud_name} as disabled. Reason: {reason}")
            self._sync_global_config()

    def get_all_accounts(self):
        with self.lock:
            return [acc for acc in self._all_accounts if acc.get("cloud_name") not in self._disabled_accounts]
        
    def get_next_accounts_generator(self):
        """Returns a generator that yields active accounts in round-robin order."""
        active = self.get_all_accounts()
        if not active:
            return
        with self.lock:
            start_index = self.current_index % len(active)
            self.current_index = (self.current_index + 1) % len(active)
            
        yield active[start_index]
        
        for i in range(1, len(active)):
            idx = (start_index + i) % len(active)
            yield active[idx]

    def upload(self, file, **kwargs):
        """
        Uploads a file using round-robin rotation across active accounts with automatic failover.
        """
        active = self.get_all_accounts()
        if not active:
            raise RuntimeError("No active Cloudinary accounts configured")

        accounts_gen = self.get_next_accounts_generator()
        last_error = None
        for account in accounts_gen:
            try:
                call_kwargs = dict(kwargs)
                call_kwargs["cloud_name"] = account["cloud_name"]
                call_kwargs["api_key"] = account["api_key"]
                call_kwargs["api_secret"] = account["api_secret"]

                if hasattr(file, "seek") and callable(file.seek):
                    try:
                        file.seek(0)
                    except Exception:
                        pass

                return _orig_upload(file, **call_kwargs)
            except Exception as e:
                err_str = str(e).lower()
                logger.warning(f"Cloudinary upload failed on {account.get('cloud_name')}: {e}")
                if "disabled customer" in err_str or "unauthorized" in err_str or "quota" in err_str or "disabled" in err_str:
                    self.mark_account_disabled(account.get("cloud_name"), str(e))
                last_error = e

        raise last_error

    def upload_large(self, file, **kwargs):
        """
        Uploads a large file using round-robin rotation across active accounts with automatic failover.
        """
        active = self.get_all_accounts()
        if not active:
            raise RuntimeError("No active Cloudinary accounts configured")

        accounts_gen = self.get_next_accounts_generator()
        last_error = None
        for account in accounts_gen:
            try:
                call_kwargs = dict(kwargs)
                call_kwargs["cloud_name"] = account["cloud_name"]
                call_kwargs["api_key"] = account["api_key"]
                call_kwargs["api_secret"] = account["api_secret"]

                if hasattr(file, "seek") and callable(file.seek):
                    try:
                        file.seek(0)
                    except Exception:
                        pass

                return _orig_upload_large(file, **call_kwargs)
            except Exception as e:
                err_str = str(e).lower()
                logger.warning(f"Cloudinary upload_large failed on {account.get('cloud_name')}: {e}")
                if "disabled customer" in err_str or "unauthorized" in err_str or "quota" in err_str or "disabled" in err_str:
                    self.mark_account_disabled(account.get("cloud_name"), str(e))
                last_error = e

        raise last_error

cloudinary_manager = CloudinaryManager()

# Hook standard cloudinary.uploader functions so ALL routes automatically round-robin
import cloudinary.uploader
_orig_upload = cloudinary.uploader.upload
_orig_upload_large = getattr(cloudinary.uploader, "upload_large", _orig_upload)

def _smart_upload(file, **kwargs):
    if kwargs.get("cloud_name") and kwargs.get("api_key") and kwargs.get("api_secret"):
        return _orig_upload(file, **kwargs)
    return cloudinary_manager.upload(file, **kwargs)

def _smart_upload_large(file, **kwargs):
    if kwargs.get("cloud_name") and kwargs.get("api_key") and kwargs.get("api_secret"):
        return _orig_upload_large(file, **kwargs)
    return cloudinary_manager.upload_large(file, **kwargs)

cloudinary.uploader.upload = _smart_upload
if hasattr(cloudinary.uploader, "upload_large"):
    cloudinary.uploader.upload_large = _smart_upload_large
