"""Environment configuration for Agent Workflow Python services."""

import os


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/agent_workflow",
)

NATS_URL = os.environ.get("NATS_URL", "nats://localhost:4222")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

NATS_STREAM_NAME = "AGENT_WORKFLOW"

# LLM configuration
PLANNER_LLM_PROVIDER = os.environ.get("PLANNER_LLM_PROVIDER", "openai")
PLANNER_LLM_MODEL = os.environ.get("PLANNER_LLM_MODEL", "gpt-4o")
