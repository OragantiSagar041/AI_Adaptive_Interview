import os
import threading
import logging

logger = logging.getLogger(__name__)

class GroqKeyManager:
    def __init__(self):
        self.keys = []
        self._load_keys()
        self.current_index = 0
        self.lock = threading.Lock()

    def _load_keys(self):
        # Allow multiple keys separated by comma
        keys_str = os.getenv("GROQ_API_KEYS")
        if keys_str:
            self.keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        else:
            # Fallback to single key if GROQ_API_KEYS isn't set
            single_key = os.getenv("GROQ_API_KEY")
            if single_key:
                self.keys = [single_key.strip()]
        
        if not self.keys:
            logger.warning("No Groq API keys found in environment variables (GROQ_API_KEYS or GROQ_API_KEY).")

    def get_next_key(self) -> str:
        """Returns the next key in a round-robin fashion."""
        if not self.keys:
            return ""
        with self.lock:
            key = self.keys[self.current_index]
            # Advance index for the next call (Round Robin)
            self.current_index = (self.current_index + 1) % len(self.keys)
            return key

    def get_total_keys(self) -> int:
        """Returns the total number of loaded keys."""
        return len(self.keys)

# Global singleton instance
groq_key_manager = GroqKeyManager()
