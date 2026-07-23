FROM python:3.11-slim

WORKDIR /app

# Packaging tools remain in the runtime image, so keep them on patched versions.
RUN python -m pip install --no-cache-dir --upgrade \
    pip==26.1.2 \
    setuptools==83.0.0

# Build tools are only needed for Python packages without prebuilt wheels.
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN apt-get purge -y --auto-remove build-essential gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy backend code
COPY . .
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Start command using PORT environment variable for Render
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
