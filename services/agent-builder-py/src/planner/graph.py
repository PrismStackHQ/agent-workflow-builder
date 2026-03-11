"""LangGraph planner agent using ReAct pattern.

Replaces the Vercel AI SDK generateText() call in llm-planner.service.ts
with a LangGraph create_react_agent loop.
"""

import logging
from typing import Any

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.config import OPENAI_API_KEY, PLANNER_LLM_MODEL
from shared.models import AvailableIntegration
from shared.nats_client import NatsService
from .callbacks import PlannerProgressCallback
from .prompt import build_action_catalog, build_agent_catalog, build_planner_prompt
from .tools import create_planner_tools

logger = logging.getLogger(__name__)


async def run_planner(
    db: AsyncSession,
    workspace_id: str,
    command: str,
    end_user_id: str | None = None,
    nats: NatsService | None = None,
    org_id: str = "",
    command_id: str = "",
) -> dict[str, Any]:
    """Run the planner agent to produce a workflow plan from a natural language command.

    Returns the plan dict with: name, triggerType, schedule, connectors, description, steps.
    """
    # Build action catalog and agent catalog
    action_catalog = await build_action_catalog(db, workspace_id)
    agent_catalog = await build_agent_catalog(db, workspace_id)

    # Build system prompt
    system_prompt = build_planner_prompt(action_catalog, agent_catalog)

    # Create tools
    tools, state = create_planner_tools(db, workspace_id, end_user_id)

    # Build integration lookup for display names/logos
    integration_lookup: dict[str, dict] = {}
    ai_result = await db.execute(
        select(AvailableIntegration).where(
            AvailableIntegration.workspaceId == workspace_id
        )
    )
    for ai in ai_result.scalars().all():
        integration_lookup[ai.providerKey] = {
            "displayName": ai.displayName,
            "logoUrl": ai.logoUrl,
        }

    # Create progress callback if NATS is available
    callbacks = []
    if nats and command_id:
        callback = PlannerProgressCallback(
            nats=nats,
            org_id=org_id,
            workspace_id=workspace_id,
            command_id=command_id,
            integration_lookup=integration_lookup,
        )
        callbacks.append(callback)

    # Create model
    model = ChatOpenAI(
        model=PLANNER_LLM_MODEL,
        api_key=OPENAI_API_KEY,
        temperature=0,
        callbacks=callbacks or None,
    )

    # Create and run the ReAct agent
    agent = create_react_agent(
        model=model,
        tools=tools,
        prompt=system_prompt,
    )

    logger.info(f"Running planner agent for workspace {workspace_id}: '{command}'")

    result = await agent.ainvoke(
        {"messages": [("human", command)]},
        config={"callbacks": callbacks} if callbacks else None,
    )

    # Extract the plan from state (set by submit_plan tool)
    plan = state.get("plan")
    if not plan:
        # Check if the agent produced text but didn't call submit_plan
        messages = result.get("messages", [])
        logger.warning(
            f"Planner did not call submit_plan. Messages: {len(messages)}"
        )
        raise ValueError("Planner agent did not produce a plan (no submit_plan call)")

    logger.info(f"Planner produced plan: {plan['name']} ({len(plan['steps'])} steps)")
    return plan
