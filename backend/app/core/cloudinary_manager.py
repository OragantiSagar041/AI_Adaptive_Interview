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

    def _load_accounts(self):
        accounts_str = os.getenv("CLOUDINARY_ACCOUNTS")
        if accounts_str:
            try:
                accounts = json.loads(accounts_str)
                if isinstance(accounts, list):
                    self._all_accounts = [acc for acc in accounts if all(acc.get(k) for k in ["cloud_name", "api_key", "api_secret"])]
            except Exception as e:
                logger.error(f"Failed to parse CLOUDINARY_ACCOUNTS JSON: {e}")

        default_account = {
            "cloud_name": os.getenv("CLOUDINARY_CLOUD_NAME"),
            "api_key": os.getenv("CLOUDINARY_API_KEY"),
            "api_secret": os.getenv("CLOUDINARY_API_SECRET"),
        }
        
        if all(default_account.values()):
            if not any(acc.get("api_key") == default_account["api_key"] for acc in self._all_accounts):
                self._all_accounts.append(default_account)

    def mark_account_disabled(self, cloud_name: str, reason: str = ""):
        with self.lock:
            self._disabled_accounts.add(cloud_name)
            logger.error(f"Marked Cloudinary account {cloud_name} as disabled. Reason: {reason}")

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

cloudinary_manager = CloudinaryManager()
