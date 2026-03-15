"""NATS progress callbacks for the planner agent.

Emits AGENT_PLANNER_PROGRESS events so the frontend can show real-time
steps during the "Analyzing your request" phase (checking connections,
loading tools, reasoning about the plan).
"""

import json
import logging
from typing import Any
from uuid import UUID

from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import LLMResult

from shared.events import SUBJECTS
from shared.nats_client import NatsService

logger = logging.getLogger(__name__)

# Tool name → human label + icon
_TOOL_DISPLAY = {
    "check_connection": ("Checked available connections", "link"),
    "submit_plan": ("Prepared execution plan", "check"),
}


class PlannerProgressCallback(AsyncCallbackHandler):
    """Emits planner progress events for frontend display."""

    def __init__(
        self,
        nats: NatsService,
        org_id: str,
        workspace_id: str,
        command_id: str,
        integration_lookup: dict[str, dict] | None = None,
    ):
        self.nats = nats
        self.org_id = org_id
        self.workspace_id = workspace_id
        self.command_id = command_id
        self.integration_lookup = integration_lookup or {}
        self._pending_tools: dict[str, str] = {}  # run_id → tool_name
        self._pending_display: dict[str, dict] = {}  # run_id → {displayName, logoUrl}

    async def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID | Any = None,
        parent_run_id: UUID | Any = None,
        **kwargs: Any,
    ) -> None:
        """Emit thinking text from the planner LLM."""
        try:
            for gen_list in response.generations:
                for gen in gen_list:
                    text = ""
                    msg = getattr(gen, "message", None)
                    if msg:
                        content = getattr(msg, "content", "")
                        if isinstance(content, str) and content.strip():
                            text = content.strip()
                        elif isinstance(content, list):
                            text_parts = []
                            for part in content:
                                if isinstance(part, dict) and part.get("type") == "text":
                                    text_parts.append(part.get("text", ""))
                                elif isinstance(part, str):
                                    text_parts.append(part)
                            text = "\n".join(p for p in text_parts if p.strip())
                    elif hasattr(gen, "text") and gen.text:
                        text = gen.text.strip()

                    if text:
                        await self.nats.publish(SUBJECTS.AGENT_PLANNER_PROGRESS, {
                            "orgId": self.org_id,
                            "workspaceId": self.workspace_id,
                            "commandId": self.command_id,
                            "stepType": "thinking",
                            "label": text[:500],
                            "icon": "search",
                        })
        except Exception as e:
            logger.error(f"Failed to publish planner thinking: {e}")

    async def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID | Any = None,
        name: str | None = None,
        inputs: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Emit a step when the planner calls a tool (e.g. check_connection)."""
        tool_name = name or serialized.get("name", "unknown")
        run_key = str(run_id) if run_id else "unknown"
        self._pending_tools[run_key] = tool_name

        display_label, icon = _TOOL_DISPLAY.get(tool_name, (tool_name.replace("_", " ").title(), "cog"))

        # Add context for check_connection
        tool_inputs = inputs or {}
        if not tool_inputs and isinstance(input_str, str):
            try:
                tool_inputs = json.loads(input_str)
            except (json.JSONDecodeError, TypeError):
                tool_inputs = {}

        display_name = None
        logo_url = None

        if tool_name == "check_connection" and tool_inputs.get("integration_key"):
            key = tool_inputs["integration_key"]
            info = self.integration_lookup.get(key, {})
            display_name = info.get("displayName") or key
            logo_url = info.get("logoUrl")
            display_label = f"Checking connection: {display_name}"
            self._pending_display[run_key] = {"displayName": display_name, "logoUrl": logo_url}

        try:
            event = {
                "orgId": self.org_id,
                "workspaceId": self.workspace_id,
                "commandId": self.command_id,
                "stepType": "tool_start",
                "label": display_label,
                "icon": icon,
            }
            if display_name:
                event["displayName"] = display_name
            if logo_url:
                event["logoUrl"] = logo_url
            await self.nats.publish(SUBJECTS.AGENT_PLANNER_PROGRESS, event)
        except Exception as e:
            logger.error(f"Failed to publish planner tool start: {e}")

    async def on_tool_end(
        self,
        output: Any,
        *,
        run_id: UUID | Any = None,
        name: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Emit tool completion with summary."""
        run_key = str(run_id) if run_id else "unknown"
        tool_name = name or self._pending_tools.pop(run_key, "unknown")
        self._pending_tools.pop(run_key, None)

        # Extract output summary
        output_str = ""
        if isinstance(output, str):
            output_str = output
        elif isinstance(output, BaseMessage):
            output_str = str(output.content) if hasattr(output, "content") else str(output)
        elif isinstance(output, (dict, list)):
            output_str = json.dumps(output, default=str)

        summary = ""
        if tool_name == "check_connection":
            try:
                data = json.loads(output_str) if isinstance(output_str, str) else output_str
                if isinstance(data, dict):
                    if data.get("connected"):
                        summary = "Connected"
                    else:
                        summary = "Not connected"
            except (json.JSONDecodeError, TypeError):
                summary = output_str[:100]
        elif tool_name == "submit_plan":
            summary = "Plan ready"

        display_label, icon = _TOOL_DISPLAY.get(tool_name, (tool_name.replace("_", " ").title(), "cog"))

        try:
            event = {
                "orgId": self.org_id,
                "workspaceId": self.workspace_id,
                "commandId": self.command_id,
                "stepType": "tool_end",
                "label": display_label,
                "icon": icon,
                "outputSummary": summary,
            }
            # Carry forward displayName/logoUrl from pending tool context
            if run_key in self._pending_display:
                info = self._pending_display.pop(run_key)
                if info.get("displayName"):
                    event["displayName"] = info["displayName"]
                if info.get("logoUrl"):
                    event["logoUrl"] = info["logoUrl"]
            await self.nats.publish(SUBJECTS.AGENT_PLANNER_PROGRESS, event)
        except Exception as e:
            logger.error(f"Failed to publish planner tool end: {e}")
