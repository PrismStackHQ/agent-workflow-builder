"""LangGraph executor agent using ReAct pattern.

This is the core agentic loop — the agent reasons about what to do next,
calls tools, observes results, and repeats until the task is done.
"""

import json
import logging
from typing import Any

from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from sqlalchemy.ext.asyncio import AsyncSession

from shared.config import DATABASE_URL, OPENAI_API_KEY, PLANNER_LLM_MODEL
from shared.nango_client import NangoClient
from shared.nats_client import NatsService
from .callbacks import NatsProgressCallback
from .ddg_search import web_search
from .file_tools import FILE_TOOLS
from .prompt import build_executor_prompt
from .tool_factory import build_workspace_tools

logger = logging.getLogger(__name__)


async def run_executor(
    db: AsyncSession,
    nats: NatsService,
    nango: NangoClient,
    workspace_id: str,
    agent_id: str,
    run_id: str,
    org_id: str,
    user_command: str,
    plan_description: str | None = None,
    end_user_id: str = "",
    connectors: list[str] | None = None,
) -> dict[str, Any]:
    """Run the executor agent for a single workflow run.

    Returns: {"status": "succeeded"|"failed", "summary": str}
    """

    # State to capture the finish summary
    finish_state: dict[str, Any] = {"summary": None}

    @tool
    async def finish(summary: str) -> str:
        """Call this when the task is fully accomplished (or cannot be completed).
        Provide a clear summary of what was done, including counts and key identifiers."""
        finish_state["summary"] = summary
        return "Task completed. Summary recorded."

    # Build workspace tools from proxy actions (filtered to plan's connectors)
    workspace_tools = await build_workspace_tools(db, workspace_id, end_user_id, nango, connectors=connectors)

    # Combine all tools: workspace + file generation + web search + finish
    all_tools = workspace_tools + FILE_TOOLS + [web_search, finish]

    # Build system prompt
    system_prompt = build_executor_prompt(user_command, plan_description)

    # Create callback for NATS progress events
    callback = NatsProgressCallback(
        nats=nats,
        org_id=org_id,
        workspace_id=workspace_id,
        agent_id=agent_id,
        run_id=run_id,
    )

    # Create model
    model = ChatOpenAI(
        model=PLANNER_LLM_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=0,
        callbacks=[callback],
    )

    # Create ReAct agent.
    # handle_tool_error=True feeds tool exceptions back to the LLM as error
    # messages instead of crashing the agent, so it can decide to try a
    # different approach or call finish() with an error summary.
    agent = create_react_agent(
        model=model,
        tools=all_tools,
        prompt=system_prompt,
    )

    logger.info(
        f"Running executor agent for run {run_id} "
        f"({len(workspace_tools)} workspace tools + {len(FILE_TOOLS) + 2} built-in tools)"
    )

    try:
        # Run the ReAct loop with a recursion limit to prevent infinite retries.
        # Each LLM call + tool call counts as ~2 steps, so 40 allows ~20 tool calls.
        result = await agent.ainvoke(
            {"messages": [("human", user_command)]},
            config={
                "callbacks": [callback],
                "recursion_limit": 40,
            },
        )

        # Check if finish was called
        summary = finish_state.get("summary")
        if not summary:
            # Extract from last message
            messages = result.get("messages", [])
            if messages:
                last = messages[-1]
                summary = last.content if hasattr(last, "content") else str(last)
            else:
                summary = "Task completed (no summary provided)"

        logger.info(f"Executor completed for run {run_id}: {summary[:200]}")
        return {"status": "succeeded", "summary": summary}

    except Exception as e:
        error_msg = str(e)
        # Provide a clearer message for recursion limit hits
        if "recursion" in error_msg.lower() or "GraphRecursionError" in type(e).__name__:
            error_msg = (
                "The agent exceeded the maximum number of steps (20 tool calls). "
                "This usually means a tool kept failing and the agent retried too many times. "
                "Please check tool configurations and try again."
            )
        logger.error(f"Executor failed for run {run_id}: {e}", exc_info=True)
        return {"status": "failed", "summary": error_msg}
