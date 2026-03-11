"""NATS event handlers for the agent-builder service.

Mirrors services/agent-builder/src/builder.handler.ts — same two subscriptions:
1. AGENT_COMMAND_SUBMITTED → run planner → publish AGENT_PLAN_PREVIEW
2. AGENT_PLAN_CONFIRMED → create AgentDefinition → trigger first run
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.events import SUBJECTS
from shared.models import AgentDefinition, AgentStatus, AvailableIntegration, ConnectionRef, ConnectionStatus
from shared.nats_client import NatsService
from .planner.graph import run_planner

logger = logging.getLogger(__name__)


async def register_handlers(nats: NatsService, db_factory) -> None:
    """Register all NATS event handlers for the builder service."""

    # ── Handle command submission ──────────────────────────────────────────

    async def handle_command_submitted(data: dict) -> None:
        workspace_id = data["workspaceId"]
        command_id = data["commandId"]
        command = data["naturalLanguageCommand"]
        org_id = data.get("orgId", "")
        end_user_id = data.get("endUserId")

        logger.info(f"Processing command {command_id} for workspace {workspace_id}")

        try:
            async with db_factory() as db:
                # Run planner agent (with NATS for real-time progress)
                plan = await run_planner(
                    db, workspace_id, command, end_user_id,
                    nats=nats, org_id=org_id, command_id=command_id,
                )

                # Check missing connections
                connection_where = [
                    ConnectionRef.workspaceId == workspace_id,
                    ConnectionRef.provider.in_(plan["connectors"]),
                    ConnectionRef.status == ConnectionStatus.READY,
                ]
                if end_user_id:
                    connection_where.append(ConnectionRef.externalRefId == end_user_id)

                ready_result = await db.execute(
                    select(ConnectionRef).where(*connection_where)
                )
                ready_connections = ready_result.scalars().all()
                ready_providers = {c.provider for c in ready_connections}
                missing_keys = [c for c in plan["connectors"] if c not in ready_providers]

                # Get integration display info
                ai_result = await db.execute(
                    select(AvailableIntegration).where(
                        AvailableIntegration.workspaceId == workspace_id
                    )
                )
                integrations = ai_result.scalars().all()
                integration_lookup = {ai.providerKey: ai for ai in integrations}

                missing_connections = []
                for key in missing_keys:
                    ai = integration_lookup.get(key)
                    missing_connections.append({
                        "providerKey": key,
                        "displayName": ai.displayName if ai else key,
                        "logoUrl": ai.logoUrl if ai else None,
                    })

                connector_display_names = {}
                for key in plan["connectors"]:
                    ai = integration_lookup.get(key)
                    connector_display_names[key] = ai.displayName if ai else key

                # Build name
                name = plan.get("name", command[:47] + "..." if len(command) > 50 else command)

                # Convert plan steps to AgentStep format for frontend compatibility
                steps = [
                    {
                        "index": i,
                        "action": step.get("action", ""),
                        "connector": step.get("connector", ""),
                        "params": {},
                        "description": step.get("description", ""),
                    }
                    for i, step in enumerate(plan.get("steps", []))
                ]

            # Publish plan preview
            await nats.publish(SUBJECTS.AGENT_PLAN_PREVIEW, {
                "orgId": org_id,
                "workspaceId": workspace_id,
                "commandId": command_id,
                "name": name,
                "naturalLanguageCommand": command,
                "triggerType": plan.get("triggerType", "manual"),
                "schedule": plan.get("schedule"),
                "connectors": plan["connectors"],
                "steps": steps,
                "missingConnections": missing_connections,
                "connectorDisplayNames": connector_display_names,
                "instructions": plan.get("description", ""),
                "endUserId": end_user_id,
            })

            logger.info(
                f"Plan preview published for command {command_id}: "
                f"{len(steps)} steps, {len(missing_connections)} missing connections"
            )

        except Exception as e:
            logger.error(f"Failed to process command: {e}", exc_info=True)

    # ── Handle plan confirmation ───────────────────────────────────────────

    async def handle_plan_confirmed(data: dict) -> None:
        workspace_id = data["workspaceId"]
        command_id = data["commandId"]
        org_id = data.get("orgId", "")
        end_user_id = data.get("endUserId")

        logger.info(f"Plan confirmed for command {command_id} in workspace {workspace_id}")

        try:
            async with db_factory() as db:
                agent_id = str(uuid.uuid4())
                name = data.get("name", data["naturalLanguageCommand"][:50])

                agent = AgentDefinition(
                    id=agent_id,
                    workspaceId=workspace_id,
                    name=name,
                    naturalLanguageCommand=data["naturalLanguageCommand"],
                    endUserId=end_user_id,
                    triggerType=data.get("triggerType", "manual"),
                    scheduleCron=data.get("schedule"),
                    requiredConnections=data.get("connectors", []),
                    steps=data.get("steps", []),
                    instructions=data.get("instructions"),
                    planDescription=data.get("instructions", ""),
                    status=AgentStatus.READY,
                    createdAt=datetime.utcnow(),
                    updatedAt=datetime.utcnow(),
                )
                db.add(agent)
                await db.commit()

            # Publish agent created (websocket forwards as 'agent_created' to frontend)
            await nats.publish(SUBJECTS.AGENT_DEFINITION_CREATED, {
                "orgId": org_id,
                "workspaceId": workspace_id,
                "agentId": agent_id,
                "name": name,
                "scheduleCron": data.get("schedule"),
                "requiredConnections": data.get("connectors", []),
                "steps": data.get("steps", []),
                "status": "READY",
            })

            # Publish agent ready
            await nats.publish(SUBJECTS.AGENT_DEFINITION_READY, {
                "orgId": org_id,
                "workspaceId": workspace_id,
                "agentId": agent_id,
            })

            # Trigger first run
            run_id = str(uuid.uuid4())
            logger.info(f"Triggering first run {run_id} for agent {agent_id}")

            await nats.publish(SUBJECTS.SCHEDULER_RUN_TRIGGERED, {
                "orgId": org_id,
                "workspaceId": workspace_id,
                "agentId": agent_id,
                "runId": run_id,
                "endUserConnectionId": end_user_id,
            })

        except Exception as e:
            logger.error(f"Failed to create agent after confirmation: {e}", exc_info=True)

    # ── Register subscriptions ─────────────────────────────────────────────

    await nats.subscribe(
        SUBJECTS.AGENT_COMMAND_SUBMITTED,
        "agent-builder-command-submitted",
        handle_command_submitted,
    )
    await nats.subscribe(
        SUBJECTS.AGENT_PLAN_CONFIRMED,
        "agent-builder-plan-confirmed",
        handle_plan_confirmed,
    )

    logger.info("Agent builder handler initialized")
