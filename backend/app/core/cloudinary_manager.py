import os
import threading
import logging
import json

logger = logging.getLogger(__name__)

class CloudinaryManager:
    def __init__(self):
        self._all_accounts = []
        self.current_index = 0
        self.lock = threading.Lock()
        self._load_accounts()

    def _load_accounts(self):
        # 1. First, check if CLOUDINARY_ACCOUNTS JSON is defined
        accounts_str = os.getenv("CLOUDINARY_ACCOUNTS")
        if accounts_str:
            try:
                accounts = json.loads(accounts_str)
                if isinstance(accounts, list):
                    self._all_accounts = [acc for acc in accounts if all(acc.get(k) for k in ["cloud_name", "api_key", "api_secret"])]
            except Exception as e:
                logger.error(f"Failed to parse CLOUDINARY_ACCOUNTS JSON: {e}")

        # 2. Add default env variables if they exist and are not already in the list
        default_account = {
            "cloud_name": os.getenv("CLOUDINARY_CLOUD_NAME"),
            "api_key": os.getenv("CLOUDINARY_API_KEY"),
            "api_secret": os.getenv("CLOUDINARY_API_SECRET"),
        }
        
        if all(default_account.values()):
            # check if not already present
            if not any(acc.get("api_key") == default_account["api_key"] for acc in self._all_accounts):
                self._all_accounts.append(default_account)

    def get_all_accounts(self):
        return self._all_accounts.copy()
        
    def get_next_accounts_generator(self):
        """Returns a generator that yields accounts in round-robin order."""
        with self.lock:
            if not self._all_accounts:
                return
            
            start_index = self.current_index
            self.current_index = (self.current_index + 1) % len(self._all_accounts)
            
        yield self._all_accounts[start_index]
        
        # Yield the rest if the first one fails
        for i in range(1, len(self._all_accounts)):
            idx = (start_index + i) % len(self._all_accounts)
            yield self._all_accounts[idx]

cloudinary_manager = CloudinaryManager()
