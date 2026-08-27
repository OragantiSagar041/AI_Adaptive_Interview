#!/bin/sh
set -e

echo "Starting application..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
