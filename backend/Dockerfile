# Python 3.11 slim image
FROM python:3.11-slim

# Build arguments for versioning
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

# Set environment variables for version info
ENV GIT_COMMIT=${GIT_COMMIT}
ENV BUILD_DATE=${BUILD_DATE}

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application (bind to PORT if provided by platform)
CMD ["/bin/sh", "-c", "echo '=== Docker Build: 2025-11-12T15:30 ===' && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
