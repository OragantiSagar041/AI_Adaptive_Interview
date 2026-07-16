FROM python:3.11-slim

WORKDIR /app

# Install system dependencies, including compilers/runtimes for code execution
RUN apt-get update && apt-get install -y \
    build-essential \
    nodejs \
    default-jdk \
    gcc \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Expose port
EXPOSE 8000

# Start command using PORT environment variable for Render
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"
