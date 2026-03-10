"""Planner agent tool definitions: check_connection and submit_plan.

These are the two tools the planner agent uses during its ReAct loop.
"""

import logging
from typing import Any

from langchain_core.tools import tool
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import AvailableIntegration, ConnectionRef, ConnectionStatus

logger = logging.getLogger(__name__)


# ── Tool Input Schemas ─────────────────────────────────────────────────────────


class CheckConnectionInput(BaseModel):
    integration_key: str = Field(description="The integration connector key to check")


class PlanStep(BaseModel):
    description: str = Field(description="What this step does")
    connector: str = Field(description="Which integration connector it uses, or empty string for local steps")
    action: str = Field(description="The action name from the catalog")


class SubmitPlanInput(BaseModel):
    name: str = Field(description="Concise workflow name (max 50 chars)", max_length=50)
    triggerType: str = Field(description='Trigger type: "manual" or "cron"', default="manual")
    schedule: str | None = Field(description="Cron expression if triggerType is cron", default=None)
    connectors: list[str] = Field(description="List of integration connector keys needed")
    description: str = Field(description="2-3 sentence summary of what the workflow will do")
    steps: list[PlanStep] = Field(description="High-level step descriptions for user preview")


# ── Tool Factory ──────────────────────────────────────────────────────────────


def create_planner_tools(
    db: AsyncSession,
    workspace_id: str,
    end_user_id: str | None = None,
) -> tuple[list, dict[str, Any]]:
    """Create planner tools bound to a specific workspace/user context.

    Returns (tools_list, state_dict) where state_dict captures the
    submitted plan when submit_plan is called.
    """
    state: dict[str, Any] = {"plan": None}

    @tool
    async def check_connection(integration_key: str) -> dict:
        """Check if the end user has a connected (READY) connection for a specific integration."""
        where_clause = [
            ConnectionRef.workspaceId == workspace_id,
            ConnectionRef.status == ConnectionStatus.READY,
        ]
        if end_user_id:
            where_clause.append(ConnectionRef.externalRefId == end_user_id)

        # Exact match
        result = await db.execute(
            select(ConnectionRef).where(
                *where_clause,
                ConnectionRef.provider == integration_key,
            ).limit(1)
        )
        exact = result.scalar_one_or_none()
        if exact and exact.connectionId:
            return {"connected": True, "connectionId": exact.connectionId}

        # Resolve via AvailableIntegration
        ai_result = await db.execute(
            select(AvailableIntegration).where(
                AvailableIntegration.workspaceId == workspace_id
            )
        )
        integrations = ai_result.scalars().all()
        key_lower = integration_key.lower()

        for ai in integrations:
            meta = ai.rawMetadata or {}
            nango_provider = str(meta.get("provider", "")).lower()
            display_lower = ai.displayName.lower().replace(" ", "-")
            pk_lower = ai.providerKey.lower()

            if pk_lower == key_lower or nango_provider == key_lower or display_lower == key_lower:
                ref_result = await db.execute(
                    select(ConnectionRef).where(
                        *where_clause,
                        ConnectionRef.provider == ai.providerKey,
                    ).limit(1)
                )
                ref = ref_result.scalar_one_or_none()
                if ref and ref.connectionId:
                    return {"connected": True, "connectionId": ref.connectionId}

        return {"connected": False}

    @tool
    async def submit_plan(
        name: str,
        triggerType: str,
        connectors: list[str],
        description: str,
        steps: list[dict],
        schedule: str | None = None,
    ) -> dict:
        """Submit the final execution plan. Call this exactly once when you have determined the plan."""
        plan = {
            "name": name,
            "triggerType": triggerType,
            "schedule": schedule,
            "connectors": connectors,
            "description": description,
            "steps": steps,
        }
        state["plan"] = plan
        logger.info(f"Plan submitted: {name} ({len(steps)} steps, connectors: {connectors})")
        return {"status": "plan_submitted", "name": name}

    return [check_connection, submit_plan], state
