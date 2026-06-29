"""
main.py — Backend entry point.

This file's ONLY responsibility is to launch the uvicorn server.
All application logic has been moved into the app/ package:

    app/
    ├── main.py        ← FastAPI factory (middleware + routers)
    ├── config.py      ← Environment variables, plan definitions, JWT config
    ├── database.py    ← MongoDB collection references
    ├── models.py      ← Pydantic request/response models
    ├── services.py    ← Business logic & helper functions
    ├── routes.py      ← All API endpoints (APIRouter)
    ├── celery_app.py  ← Celery worker configuration
    └── tasks.py       ← Background Celery tasks

To run:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

To run Celery worker:
    celery -A app.celery_app.celery_app worker --loglevel=info
"""

from app.main import app  # noqa: F401  — re-exported for uvicorn

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
