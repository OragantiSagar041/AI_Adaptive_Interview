#!/bin/sh
set -e

echo "Fetching .env from S3..."
python /app/fetch_env.py

echo "Starting application..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
