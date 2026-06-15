import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

# CRITICAL: Add the backend directory to sys.path so the internal imports in main.py work seamlessly
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_path)

from a2wsgi import ASGIMiddleware
from backend.main import app

application = ASGIMiddleware(app)
