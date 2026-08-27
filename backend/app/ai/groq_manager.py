import os
import threading
import logging

logger = logging.getLogger(__name__)

class GroqKeyManager:
    def __init__(self):
        self._all_keys = []
        self._bad_keys: set = set()   # temporarily blacklisted (invalid / expired)
        self._bad_key_failure_counts: dict = {}  # track consecutive failures per key
        self.current_index = 0
        self.lock = threading.Lock()
        self._load_keys()

    def _load_keys(self):
        """Load (or reload) keys from environment variables."""
        # Allow multiple keys separated by comma
        keys_str = os.getenv("GROQ_API_KEYS")
        if keys_str:
            loaded = [k.strip() for k in keys_str.split(",") if k.strip()]
        else:
            # Fallback to single key if GROQ_API_KEYS isn't set
            single_key = os.getenv("GROQ_API_KEY")
            loaded = [single_key.strip()] if single_key and single_key.strip() else []

        if loaded:
            self._all_keys = loaded
        elif not self._all_keys:
            # Only warn if we truly have no keys (first load failure)
            logger.warning(
                "No Groq API keys found in environment variables (GROQ_API_KEYS or GROQ_API_KEY)."
            )

    def reload_keys(self):
        """
        Re-read keys from environment and clear the bad-key blacklist.
        Call this to recover from a situation where all keys were blacklisted
        due to transient errors (e.g. network blip at container startup).
        """
        with self.lock:
            self._load_keys()
            # Clear blacklist so freshly-loaded keys get a clean slate
            self._bad_keys.clear()
            self._bad_key_failure_counts.clear()
            active = len(self.keys)
            if active:
                logger.info(f"[GroqKeyManager] Reloaded {active} active key(s) from environment.")
            else:
                logger.error("[GroqKeyManager] reload_keys() found no keys in environment.")

    @property
    def keys(self):
        """Active (non-blacklisted) keys."""
        return [k for k in self._all_keys if k not in self._bad_keys]

    def mark_invalid(self, key: str):
        """
        Increment the failure count for a key that returned HTTP 401.
        A key is only permanently blacklisted after 2 consecutive failures
        to avoid permanent removal from a single transient network hiccup.

        If all keys end up blacklisted, automatically attempts a reload from env
        so the manager can recover without requiring a process restart.
        """
        with self.lock:
            if not key:
                return
            self._bad_key_failure_counts[key] = self._bad_key_failure_counts.get(key, 0) + 1
            failures = self._bad_key_failure_counts[key]

            if failures >= 2:
                # Only permanently blacklist after 2 consecutive auth failures
                if key not in self._bad_keys:
                    self._bad_keys.add(key)
                    active = len(self.keys)
                    logger.warning(
                        f"Groq key ending …{key[-6:]} marked INVALID after {failures} failures "
                        f"and removed from rotation. Active keys remaining: {active}"
                    )
                    if active == 0:
                        logger.error(
                            "ALL Groq API keys are blacklisted. Attempting reload from environment..."
                        )
                        # Auto-recover: reload keys from env (clears blacklist)
                        self._load_keys()
                        self._bad_keys.clear()
                        self._bad_key_failure_counts.clear()
                        recovered = len(self.keys)
                        if recovered:
                            logger.info(
                                f"[GroqKeyManager] Auto-recovered {recovered} key(s) from environment."
                            )
                        else:
                            logger.error(
                                "Auto-recovery failed — GROQ_API_KEYS is empty or not set. "
                                "STT will be unavailable until valid keys are configured."
                            )
            else:
                logger.warning(
                    f"Groq key ending …{key[-6:]} received auth failure #{failures}/2 — "
                    "keeping in rotation until threshold reached."
                )

    def get_next_key(self) -> str:
        """Returns the next valid key in a round-robin fashion."""
        active = self.keys
        if not active:
            # Last resort: try reloading from environment before giving up
            self.reload_keys()
            active = self.keys
        if not active:
            return ""
        with self.lock:
            # Clamp index in case keys list shrank due to blacklisting
            active = self.keys  # re-read after possible reload
            if not active:
                return ""
            self.current_index = self.current_index % len(active)
            key = active[self.current_index]
            self.current_index = (self.current_index + 1) % len(active)
            return key

    def get_total_keys(self) -> int:
        """Returns the number of currently active (non-blacklisted) keys."""
        return len(self.keys)


# Global singleton instance
# NOTE: keys are loaded on first use, not at import time, so env vars are
# guaranteed to be populated by the time this is called.
groq_key_manager = GroqKeyManager()
