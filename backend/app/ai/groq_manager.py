import os
import threading
import logging

logger = logging.getLogger(__name__)

class GroqKeyManager:
    def __init__(self):
        self._all_keys = []
        self._bad_keys: set = set()   # permanently blacklisted (invalid / expired)
        self._load_keys()
        self.current_index = 0
        self.lock = threading.Lock()

    def _load_keys(self):
        found_keys = []
        # Check GROQ_API_KEYS comma separated
        keys_str = os.getenv("GROQ_API_KEYS")
        if keys_str:
            found_keys.extend([k.strip() for k in keys_str.split(",") if k.strip()])
        
        # Check GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, etc.
        for env_var in ["GROQ_API_KEY", "GROQ_API_KEY_2", "GROQ_API_KEY_3", "GROQ_API_KEY_4"]:
            val = os.getenv(env_var)
            if val and val.strip() and val.strip() not in found_keys:
                found_keys.append(val.strip())

        self._all_keys = found_keys
        if not self._all_keys:
            logger.warning("No Groq API keys found in environment variables (GROQ_API_KEYS, GROQ_API_KEY, GROQ_API_KEY_2, etc.).")

    @property
    def keys(self):
        """Active (non-blacklisted) keys."""
        return [k for k in self._all_keys if k not in self._bad_keys]

    def mark_invalid(self, key: str):
        """Permanently remove a key that returned HTTP 401 (invalid/expired)."""
        with self.lock:
            if key and key not in self._bad_keys:
                self._bad_keys.add(key)
                active = len(self.keys)
                logger.warning(
                    f"Groq key ending …{key[-6:]} marked INVALID and removed from rotation. "
                    f"Active keys remaining: {active}"
                )
                if active == 0:
                    logger.error(
                        "ALL Groq API keys are invalid. STT/transcription will fail until "
                        "valid keys are added to GROQ_API_KEYS."
                    )

    def get_next_key(self) -> str:
        """Returns the next valid key in a round-robin fashion."""
        active = self.keys
        if not active:
            return ""
        with self.lock:
            # Clamp index in case keys list shrank due to blacklisting
            self.current_index = self.current_index % len(active)
            key = active[self.current_index]
            self.current_index = (self.current_index + 1) % len(active)
            return key

    def get_total_keys(self) -> int:
        """Returns the number of currently active (non-blacklisted) keys."""
        return len(self.keys)


# Global singleton instance
groq_key_manager = GroqKeyManager()
