"""NATS event callbacks for the executor agent.

Emits RUNTIME_RUN_STEP_COMPLETED events on each tool call so the
frontend (via websocket-service) shows real-time progress with
input/output details (Claude Code-style tool call display).
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

# Tool name → icon mapping for the frontend
_TOOL_ICONS = {
    "search": "search",
    "list": "search",
    "find": "search",
    "get": "cog",
    "fetch": "cog",
    "create": "play",
    "upload": "play",
    "send": "play",
    "generate_pdf": "play",
    "generate_excel": "play",
    "generate_csv": "play",
    "web_search": "search",
    "check_connection": "link",
    "finish": "check",
}


def _icon_for_tool(tool_name: str) -> str:
    """Pick a frontend icon based on tool name keywords."""
    name_lower = tool_name.lower()
    for keyword, icon in _TOOL_ICONS.items():
        if keyword in name_lower:
            return icon
    return "cog"


def _humanize_tool_name(tool_name: str) -> str:
    """Convert tool_name like 'google_drive_4__search_files' to 'Google Drive 4: Search Files'."""
    if "__" in tool_name:
        connector, action = tool_name.split("__", 1)
        connector_display = connector.replace("_", " ").title()
        action_display = action.replace("_", " ").title()
        return f"{connector_display}: {action_display}"
    return tool_name.replace("_", " ").title()


def _summarize_inputs(tool_name: str, inputs: dict) -> str:
    """Create a one-line human-readable summary of tool inputs."""
    if not inputs:
        return ""

    # Filter out empty/None values
    clean = {k: v for k, v in inputs.items() if v is not None and v != "" and v != {}}
    if not clean:
        return ""

    # Special cases for known tools
    name_lower = tool_name.lower()
    if "search" in name_lower or "list" in name_lower or "find" in name_lower:
        query = clean.get("query") or clean.get("q") or clean.get("search") or clean.get("keyword")
        if query:
            return f'Searching for "{query}"'
    if "get" in name_lower or "fetch" in name_lower:
        item_id = clean.get("id") or clean.get("messageId") or clean.get("fileId") or clean.get("threadId")
        if item_id:
            return f"Fetching item {item_id}"
    if "send" in name_lower:
        to = clean.get("to") or clean.get("recipient") or clean.get("email")
        if to:
            return f"Sending to {to}"
    if "create" in name_lower or "upload" in name_lower:
        name = clean.get("name") or clean.get("title") or clean.get("fileName") or clean.get("filename")
        if name:
            return f'Creating "{name}"'
    if "generate_excel" in name_lower:
        sheet = clean.get("sheet_name", "")
        rows = clean.get("rows", [])
        count = len(rows) if isinstance(rows, list) else "?"
        return f'Generating Excel "{sheet}" with {count} rows'
    if "generate_pdf" in name_lower:
        title = clean.get("title", "")
        return f'Generating PDF "{title}"'
    if "generate_csv" in name_lower:
        rows = clean.get("rows", [])
        count = len(rows) if isinstance(rows, list) else "?"
        return f"Generating CSV with {count} rows"
    if "web_search" in name_lower:
        query = clean.get("query", "")
        return f'Searching web for "{query}"'

    # Generic: show first 2 key=value pairs
    pairs = []
    for k, v in list(clean.items())[:2]:
        val_str = str(v)
        if len(val_str) > 50:
            val_str = val_str[:50] + "..."
        pairs.append(f"{k}={val_str}")
    return ", ".join(pairs)


def _summarize_output(tool_name: str, output: str) -> str:
    """Create a one-line human-readable summary of tool output."""
    if not output:
        return "No output"

    # Try to parse as JSON
    try:
        data = json.loads(output) if isinstance(output, str) else output
    except (json.JSONDecodeError, TypeError):
        data = output

    if isinstance(data, dict):
        if "error" in data:
            return f"Error: {data['error'][:100]}"
        # Count items if it looks like a list wrapper
        for key in ("results", "items", "files", "messages", "data"):
            if key in data and isinstance(data[key], list):
                return f"Found {len(data[key])} {key}"
        return f"Returned {len(data)} fields"

    if isinstance(data, list):
        return f"Returned {len(data)} items"

    if isinstance(data, str):
        if "created successfully" in data.lower() or "generated" in data.lower():
            return data[:150]
        if len(data) > 100:
            return data[:100] + "..."
        return data

    return str(data)[:100]


def _trim_args_for_display(inputs: dict) -> dict:
    """Trim arguments for frontend display — drop huge values."""
    if not inputs:
        return {}
    trimmed = {}
    for k, v in inputs.items():
        if isinstance(v, str) and len(v) > 200:
            trimmed[k] = v[:200] + "...[truncated]"
        elif isinstance(v, list) and len(v) > 5:
            trimmed[k] = v[:3]
            trimmed[k].append(f"...and {len(v) - 3} more")
        elif isinstance(v, dict) and len(json.dumps(v, default=str)) > 200:
            trimmed[k] = {kk: "..." for kk in list(v.keys())[:5]}
        else:
            trimmed[k] = v
    return trimmed


def _extract_output_str(output: Any) -> str:
    """Extract a plain string from LangChain tool output (may be ToolMessage, str, etc.)."""
    if isinstance(output, str):
        return output
    # LangChain ToolMessage or other BaseMessage
    if isinstance(output, BaseMessage):
        content = output.content
        if isinstance(content, str):
            return content
        # content can be a list of dicts (multi-part)
        if isinstance(content, list):
            parts = []
            for part in content:
                if isinstance(part, dict):
                    parts.append(part.get("text", str(part)))
                else:
                    parts.append(str(part))
            return "\n".join(parts)
        return str(content)
    # dict/list — serialize
    if isinstance(output, (dict, list)):
        try:
            return json.dumps(output, default=str)
        except (TypeError, ValueError):
            return str(output)
    return str(output) if output is not None else ""


def _make_json_safe(obj: Any) -> Any:
    """Recursively ensure an object is JSON-serializable."""
    if isinstance(obj, dict):
        return {str(k): _make_json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_make_json_safe(item) for item in obj]
    if isinstance(obj, (str, int, float, bool)) or obj is None:
        return obj
    # Fallback: stringify anything else
    return str(obj)


class NatsProgressCallback(AsyncCallbackHandler):
    """Emits NATS events on each tool call for frontend progress tracking.

    Captures tool inputs on_tool_start and pairs them with output on_tool_end
    to send rich step data including arguments, human-readable descriptions,
    and summarized results.
    """

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
        # Map from LangChain run_id → (tool_name, input_dict)
        self._pending_tools: dict[str, tuple[str, dict]] = {}

    async def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID | Any = None,
        parent_run_id: UUID | Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when the LLM produces a response. Emit reasoning text if present."""
        try:
            for gen_list in response.generations:
                for gen in gen_list:
                    # Extract text content from the generation
                    text = ""
                    msg = getattr(gen, "message", None)
                    if msg:
                        # AIMessage — check for text content alongside tool calls
                        content = getattr(msg, "content", "")
                        if isinstance(content, str) and content.strip():
                            text = content.strip()
                        elif isinstance(content, list):
                            # Multi-part content — extract text parts
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
                        await self.nats.publish(SUBJECTS.RUNTIME_RUN_THINKING, {
                            "orgId": self.org_id,
                            "workspaceId": self.workspace_id,
                            "agentId": self.agent_id,
                            "runId": self.run_id,
                            "text": text[:2000],  # Cap at 2K chars
                        })
        except Exception as e:
            logger.error(f"Failed to publish thinking event: {e}")

    async def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: UUID | Any = None,
        parent_run_id: UUID | Any = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        name: str | None = None,
        inputs: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Capture tool inputs for pairing with output later."""
        tool_name = name or serialized.get("name", "unknown_tool")
        if tool_name == "finish":
            return

        # Parse inputs from input_str or inputs dict
        tool_inputs = inputs or {}
        if not tool_inputs and isinstance(input_str, str):
            try:
                tool_inputs = json.loads(input_str)
            except (json.JSONDecodeError, TypeError):
                tool_inputs = {"input": input_str}
        if isinstance(tool_inputs, str):
            try:
                tool_inputs = json.loads(tool_inputs)
            except (json.JSONDecodeError, TypeError):
                tool_inputs = {"input": tool_inputs}

        run_key = str(run_id) if run_id else "unknown"
        self._pending_tools[run_key] = (tool_name, tool_inputs)

        # Emit a "running" step indicator immediately
        input_summary = _summarize_inputs(tool_name, tool_inputs)
        display_name = _humanize_tool_name(tool_name)

        try:
            await self.nats.publish(SUBJECTS.RUNTIME_RUN_STEP_COMPLETED, {
                "orgId": self.org_id,
                "workspaceId": self.workspace_id,
                "agentId": self.agent_id,
                "runId": self.run_id,
                "stepIndex": self.step_index,
                "stepName": tool_name,
                "stepDescription": display_name,
                "status": "running",
                "icon": _icon_for_tool(tool_name),
                "inputSummary": input_summary,
                "arguments": _trim_args_for_display(tool_inputs),
                "result": None,
            })
        except Exception as e:
            logger.error(f"Failed to publish step started event: {e}")

    async def on_tool_end(
        self,
        output: Any,
        *,
        run_id: UUID | Any = None,
        parent_run_id: UUID | Any = None,
        tags: list[str] | None = None,
        name: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool completes. Emit step completed event with inputs + outputs."""
        run_key = str(run_id) if run_id else "unknown"
        tool_name = name or "unknown_tool"
        tool_inputs = {}

        # Recover inputs from on_tool_start
        if run_key in self._pending_tools:
            tool_name, tool_inputs = self._pending_tools.pop(run_key)

        if tool_name == "finish":
            return

        # Extract string content from LangChain message objects
        output_str = _extract_output_str(output)

        # Parse output for structured result
        try:
            result_data = json.loads(output_str) if isinstance(output_str, str) else output_str
        except (json.JSONDecodeError, TypeError):
            result_data = output_str

        display_name = _humanize_tool_name(tool_name)
        input_summary = _summarize_inputs(tool_name, tool_inputs)
        output_summary = _summarize_output(tool_name, output_str)

        # Ensure result is JSON-serializable
        if isinstance(result_data, (dict, list)):
            safe_result = _make_json_safe(result_data)
        else:
            safe_result = {"output": str(result_data) if result_data is not None else ""}

        try:
            await self.nats.publish(SUBJECTS.RUNTIME_RUN_STEP_COMPLETED, {
                "orgId": self.org_id,
                "workspaceId": self.workspace_id,
                "agentId": self.agent_id,
                "runId": self.run_id,
                "stepIndex": self.step_index,
                "stepName": tool_name,
                "stepDescription": display_name,
                "status": "completed",
                "icon": _icon_for_tool(tool_name),
                "inputSummary": input_summary,
                "outputSummary": output_summary,
                "arguments": _trim_args_for_display(tool_inputs),
                "result": safe_result,
            })
        except Exception as e:
            logger.error(f"Failed to publish step completed event: {e}")

        self.step_index += 1

    async def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: UUID | Any = None,
        parent_run_id: UUID | Any = None,
        tags: list[str] | None = None,
        name: str | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool errors. Emit step failed event."""
        run_key = str(run_id) if run_id else "unknown"
        tool_name = name or "unknown_tool"
        tool_inputs = {}

        if run_key in self._pending_tools:
            tool_name, tool_inputs = self._pending_tools.pop(run_key)

        if tool_name == "finish":
            return

        display_name = _humanize_tool_name(tool_name)

        try:
            await self.nats.publish(SUBJECTS.RUNTIME_RUN_STEP_COMPLETED, {
                "orgId": self.org_id,
                "workspaceId": self.workspace_id,
                "agentId": self.agent_id,
                "runId": self.run_id,
                "stepIndex": self.step_index,
                "stepName": tool_name,
                "stepDescription": display_name,
                "status": "failed",
                "icon": "zap",
                "inputSummary": _summarize_inputs(tool_name, tool_inputs),
                "outputSummary": f"Error: {str(error)[:200]}",
                "arguments": _trim_args_for_display(tool_inputs),
                "result": {"error": str(error)[:500]},
            })
        except Exception as e:
            logger.error(f"Failed to publish step error event: {e}")

        self.step_index += 1
