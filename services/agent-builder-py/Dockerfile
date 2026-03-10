FROM python:3.12-slim

WORKDIR /app

# Install shared library
COPY services/shared-py/ /app/shared-py/
RUN pip install --no-cache-dir /app/shared-py/

# Install builder service
COPY services/agent-builder-py/ /app/service/
RUN pip install --no-cache-dir /app/service/

WORKDIR /app/service

CMD ["python", "-m", "src.main"]
