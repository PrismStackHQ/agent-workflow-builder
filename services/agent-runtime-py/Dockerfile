FROM python:3.12-slim

WORKDIR /app

# Install Unicode font for PDF generation
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

# Install shared library
COPY services/shared-py/ /app/shared-py/
RUN pip install --no-cache-dir /app/shared-py/

# Install runtime service
COPY services/agent-runtime-py/ /app/service/
RUN pip install --no-cache-dir /app/service/

WORKDIR /app/service

CMD ["python", "-m", "src.main"]
