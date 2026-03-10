"""NATS event callbacks for the executor agent.

Emits RUNTIME_RUN_STEP_COMPLETED events on each tool call so the
frontend (via websocket-service) shows real-time progress.
"""

import json
import logging
from typing import Any

from langchain_core.callbacks import AsyncCallbackHandler

from shared.events import SUBJECTS
from shared.nats_client import NatsService

logger = logging.getLogger(__name__)


class NatsProgressCallback(AsyncCallbackHandler):
    """Emits NATS events on each tool call for frontend progress tracking."""

    def __init__(
        self,
        nats: NatsService,
        org_id: str,
        workspace_id: str,
        agent_id: str,
        run_id: str,
    ):
        self.nats = nats
        self.org_id = org_id
        self.workspace_id = workspace_id
        self.agent_id = agent_id
        self.run_id = run_id
        self.step_index = 0

    async def on_tool_end(
        self,
        output: str,
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        name: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool completes. Emit step completed event."""
        tool_name = name or kwargs.get("name", "unknown_tool")

        # Skip internal tools like 'finish'
        if tool_name == "finish":
            return

        # Parse result for display
        result_preview = output
        if isinstance(output, str) and len(output) > 500:
            result_preview = output[:500] + "..."

        try:
            result_data = json.loads(output) if isinstance(output, str) else output
        except (json.JSONDecodeError, TypeError):
            result_data = output

        try:
            await self.nats.publish(SUBJECTS.RUNTIME_RUN_STEP_COMPLETED, {
                "orgId": self.org_id,
                "workspaceId": self.workspace_id,
                "agentId": self.agent_id,
                "runId": self.run_id,
                "stepIndex": self.step_index,
                "stepName": tool_name,
                "stepDescription": f"Executed {tool_name.replace('__', ' → ').replace('_', ' ')}",
                "result": result_data if isinstance(result_data, (dict, list)) else None,
            })
        except Exception as e:
            logger.error(f"Failed to publish step completed event: {e}")

        self.step_index += 1
