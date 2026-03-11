"""NATS event handlers for the agent-runtime service.

Mirrors services/agent-runtime/src/runtime.handler.ts — same three subscriptions:
1. SCHEDULER_RUN_TRIGGERED → run executor agent
2. RUNTIME_RUN_RESUME_REQUESTED → resume paused run
3. CONNECTION_COMPLETED → find paused runs and resume them
"""

import logging
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.events import SUBJECTS
from shared.models import AgentDefinition, AgentRun, RunStatus
from shared.nango_client import NangoClient
from shared.nats_client import NatsService
from .executor.graph import run_executor

logger = logging.getLogger(__name__)


async def register_handlers(
    nats: NatsService,
    db_factory,
    nango: NangoClient,
) -> None:
    """Register all NATS event handlers for the runtime service."""

    # ── Handle run triggered ───────────────────────────────────────────────

    async def handle_run_triggered(data: dict) -> None:
        agent_id = data["agentId"]
        workspace_id = data["workspaceId"]
        org_id = data.get("orgId", "")
        end_user_id = data.get("endUserConnectionId", "")

        logger.info(
            f"Run triggered for agent {agent_id}, "
            f"workspace {workspace_id}, endUser={end_user_id or 'none'}"
        )

        try:
            async with db_factory() as db:
                # Load agent definition
                agent = await db.get(AgentDefinition, agent_id)
                if not agent:
                    logger.error(f"Agent {agent_id} not found")
                    return

                ws_id = workspace_id or agent.workspaceId
                conn_id = end_user_id or ""

                # Create or update run record
                run_id = data.get("runId") or str(uuid.uuid4())
                now = datetime.utcnow()

                run = await db.get(AgentRun, run_id)
                if run:
                    # Run already created by scheduler/builder — update it
                    run.status = RunStatus.RUNNING
                    run.startedAt = now
                    if conn_id:
                        run.endUserConnectionId = conn_id
                else:
                    run = AgentRun(
                        id=run_id,
                        agentId=agent_id,
                        status=RunStatus.RUNNING,
                        startedAt=now,
                        endUserConnectionId=conn_id or None,
                        createdAt=now,
                    )
                    db.add(run)
                await db.commit()

                # Publish run started
                await nats.publish(SUBJECTS.RUNTIME_RUN_STARTED, {
                    "orgId": org_id,
                    "workspaceId": ws_id,
                    "agentId": agent_id,
                    "runId": run_id,
                    "startedAt": now.isoformat(),
                })

                # Run the executor agent
                connectors = agent.requiredConnections if isinstance(agent.requiredConnections, list) else []
                result = await run_executor(
                    db=db,
                    nats=nats,
                    nango=nango,
                    workspace_id=ws_id,
                    agent_id=agent_id,
                    run_id=run_id,
                    org_id=org_id,
                    user_command=agent.naturalLanguageCommand,
                    plan_description=agent.planDescription or agent.instructions,
                    end_user_id=conn_id,
                    connectors=connectors,
                )

                # Update run status
                ended_at = datetime.utcnow()
                if result["status"] == "succeeded":
                    run.status = RunStatus.SUCCEEDED
                    run.endedAt = ended_at
                    await db.commit()

                    await nats.publish(SUBJECTS.RUNTIME_RUN_SUCCEEDED, {
                        "orgId": org_id,
                        "workspaceId": ws_id,
                        "agentId": agent_id,
                        "runId": run_id,
                        "endedAt": ended_at.isoformat(),
                        "summary": result["summary"],
                    })
                else:
                    run.status = RunStatus.FAILED
                    run.endedAt = ended_at
                    run.errorMessage = result["summary"]
                    await db.commit()

                    await nats.publish(SUBJECTS.RUNTIME_RUN_FAILED, {
                        "orgId": org_id,
                        "workspaceId": ws_id,
                        "agentId": agent_id,
                        "runId": run_id,
                        "endedAt": ended_at.isoformat(),
                        "error": result["summary"],
                    })

                logger.info(f"Run {run_id} completed: {result['status']}")

        except Exception as e:
            logger.error(f"Run execution failed: {e}", exc_info=True)
            # Publish failure event so the frontend knows the run crashed
            try:
                ended_at = datetime.utcnow()
                await nats.publish(SUBJECTS.RUNTIME_RUN_FAILED, {
                    "orgId": org_id,
                    "workspaceId": workspace_id,
                    "agentId": agent_id,
                    "runId": data.get("runId", "unknown"),
                    "endedAt": ended_at.isoformat(),
                    "error": f"Runtime error: {str(e)[:500]}",
                })
            except Exception as pub_err:
                logger.error(f"Failed to publish failure event: {pub_err}")

    # ── Handle resume request ──────────────────────────────────────────────

    async def handle_resume_requested(data: dict) -> None:
        run_id = data["runId"]
        connection_id = data.get("connectionId", "")

        logger.info(f"Resume requested for run {run_id}")

        try:
            async with db_factory() as db:
                run = await db.get(AgentRun, run_id)
                if not run:
                    logger.error(f"Run {run_id} not found")
                    return
                if run.status != RunStatus.PAUSED:
                    logger.error(f"Run {run_id} is not paused (status: {run.status})")
                    return

                agent = await db.get(AgentDefinition, run.agentId)
                if not agent:
                    logger.error(f"Agent {run.agentId} not found")
                    return

                # Update run status
                now = datetime.utcnow()
                run.status = RunStatus.RUNNING
                run.resumedAt = now
                run.pausedAt = None
                run.pausedAtStepIndex = None
                run.pauseReason = None
                run.pauseMetadata = None
                if connection_id:
                    run.endUserConnectionId = connection_id
                await db.commit()

                await nats.publish(SUBJECTS.RUNTIME_RUN_RESUMED, {
                    "orgId": "",
                    "workspaceId": agent.workspaceId,
                    "agentId": agent.id,
                    "runId": run_id,
                    "resumedAt": now.isoformat(),
                })

                # Re-run the executor agent (fresh run with same command)
                resume_connectors = agent.requiredConnections if isinstance(agent.requiredConnections, list) else []
                result = await run_executor(
                    db=db,
                    nats=nats,
                    nango=nango,
                    workspace_id=agent.workspaceId,
                    agent_id=agent.id,
                    run_id=run_id,
                    org_id="",
                    user_command=agent.naturalLanguageCommand,
                    plan_description=agent.planDescription or agent.instructions,
                    end_user_id=connection_id or run.endUserConnectionId or "",
                    connectors=resume_connectors,
                )

                # Update final status
                ended_at = datetime.utcnow()
                subject = SUBJECTS.RUNTIME_RUN_SUCCEEDED if result["status"] == "succeeded" else SUBJECTS.RUNTIME_RUN_FAILED
                run.status = RunStatus.SUCCEEDED if result["status"] == "succeeded" else RunStatus.FAILED
                run.endedAt = ended_at
                if result["status"] != "succeeded":
                    run.errorMessage = result["summary"]
                await db.commit()

                payload = {
                    "orgId": "",
                    "workspaceId": agent.workspaceId,
                    "agentId": agent.id,
                    "runId": run_id,
                    "endedAt": ended_at.isoformat(),
                }
                if result["status"] == "succeeded":
                    payload["summary"] = result["summary"]
                else:
                    payload["error"] = result["summary"]

                await nats.publish(subject, payload)

        except Exception as e:
            logger.error(f"Failed to resume run {run_id}: {e}", exc_info=True)

    # ── Handle connection completed ────────────────────────────────────────

    async def handle_connection_completed(data: dict) -> None:
        integration_key = data["integrationKey"]
        workspace_id = data["workspaceId"]
        org_id = data.get("orgId", "")
        connection_id = data.get("connectionId", "")

        logger.info(f"Connection completed for {integration_key}, workspace {workspace_id}")

        try:
            async with db_factory() as db:
                # Find paused runs that need this integration
                result = await db.execute(
                    select(AgentRun).where(
                        AgentRun.status == RunStatus.PAUSED,
                        AgentRun.pauseReason.startswith(f"connection_required:{integration_key}"),
                    )
                )
                paused_runs = result.scalars().all()

                for run in paused_runs:
                    logger.info(f"Auto-resuming run {run.id} after connection completed")
                    await nats.publish(SUBJECTS.RUNTIME_RUN_RESUME_REQUESTED, {
                        "orgId": org_id,
                        "workspaceId": workspace_id,
                        "runId": run.id,
                        "connectionId": connection_id,
                    })

        except Exception as e:
            logger.error(f"Failed to handle connection completed: {e}", exc_info=True)

    # ── Register subscriptions ─────────────────────────────────────────────

    await nats.subscribe(
        SUBJECTS.SCHEDULER_RUN_TRIGGERED,
        "runtime-run-triggered",
        handle_run_triggered,
    )
    await nats.subscribe(
        SUBJECTS.RUNTIME_RUN_RESUME_REQUESTED,
        "runtime-run-resume",
        handle_resume_requested,
    )
    await nats.subscribe(
        SUBJECTS.CONNECTION_COMPLETED,
        "runtime-connection-completed",
        handle_connection_completed,
    )

    logger.info("Runtime handler initialized")
