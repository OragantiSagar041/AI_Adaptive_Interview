FROM python:3.11-slim

WORKDIR /app

# Packaging tools remain in the runtime image, so keep them on patched versions.
RUN python -m pip install --no-cache-dir --upgrade \
    pip==26.1.2 \
    setuptools==83.0.0

# Audio processing and build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
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

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Ensure /tmp exists with full permissions, create user and set ownership
RUN mkdir -p /tmp && chmod 1777 /tmp \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app

USER appuser

# Explicitly set TMPDIR environment variable
ENV TMPDIR=/tmp

# Expose port
EXPOSE 8000

# Start the app
ENTRYPOINT ["/bin/sh", "/app/entrypoint.sh"]