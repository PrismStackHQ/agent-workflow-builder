"""System prompt builder for the planner agent.

Replaces the buildSystemPrompt() + buildActionCatalog() from
services/agent-builder/src/builder/llm-planner.service.ts with a
role-and-tool-centric prompt suitable for an agentic ReAct loop.
"""

import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import AgentDefinition, AgentStatus, AvailableIntegration, ToolRegistryEntry

logger = logging.getLogger(__name__)


async def build_action_catalog(db: AsyncSession, workspace_id: str) -> str:
    """Build a formatted action catalog from the tool registry.

    Groups actions by connector with their inputSchema, same as the TS version.
    """
    result = await db.execute(
        select(ToolRegistryEntry).where(
            ToolRegistryEntry.workspaceId == workspace_id
        )
    )
    tools = result.scalars().all()

    ai_result = await db.execute(
        select(AvailableIntegration).where(
            AvailableIntegration.workspaceId == workspace_id
        )
    )
    integrations = ai_result.scalars().all()

    if not tools:
        return "(No actions available — the workspace has no registered integrations)"

    # Display name lookup
    display_names = {ai.providerKey: ai.displayName for ai in integrations}

    # Group by connector
    by_connector: dict[str, list] = {}
    for t in tools:
        by_connector.setdefault(t.integrationKey, []).append(t)

    sections = []
    for connector, actions in by_connector.items():
        display = display_names.get(connector, connector)
        lines = []
        for a in actions:
            schema = f'\n    inputSchema: {a.inputSchema}' if a.inputSchema else ''
            output = f'\n    outputSchema: {a.outputSchema}' if a.outputSchema else ''
            lines.append(f'  - {a.actionName} ({a.displayName}): {a.description or "No description"}{schema}{output}')
        sections.append(
            f'### {connector} ({display})\n'
            f'Connector key to use: "{connector}"\n'
            + '\n'.join(lines)
        )

    return '\n\n'.join(sections)


async def build_agent_catalog(db: AsyncSession, workspace_id: str) -> str:
    """Build a catalog of existing reusable agents in the workspace."""
    result = await db.execute(
        select(AgentDefinition).where(
            AgentDefinition.workspaceId == workspace_id,
            AgentDefinition.status.in_([AgentStatus.READY, AgentStatus.SCHEDULED]),
        ).limit(20)
    )
    agents = result.scalars().all()
    if not agents:
        return ""

    lines = []
    for a in agents:
        conns = ", ".join(a.requiredConnections) if isinstance(a.requiredConnections, list) else ""
        lines.append(
            f'### {a.id} — "{a.name}"\n'
            f'Original command: "{a.naturalLanguageCommand}"\n'
            f'Connections: {conns or "none"}'
        )

    return (
        "\n\n## Available Sub-Agents\n"
        "You can reference existing agents if the user's request clearly maps to one.\n\n"
        + "\n\n".join(lines)
    )


def build_planner_prompt(action_catalog: str, agent_catalog: str = "") -> str:
    """Build the planner agent's system prompt.

    This is a role-and-tool-centric prompt — no step ordering rules,
    no {{step[N].result}} syntax, no minimum step counts.
    """
    return f"""You are a workflow planning assistant. The user describes a task they want automated.
Your job is to:
1. Understand what the user wants to accomplish
2. Identify which integrations and actions are needed
3. Check if the required connections are available using the check_connection tool
4. Produce a clear, structured plan by calling submit_plan

## Available Integrations & Actions
{action_catalog}
{agent_catalog}

## Guidelines

### Choosing Actions
- Use ONLY action names from the catalog above — never invent action names.
- Use the EXACT connector key shown in the catalog for each action.
- Match the action to what the user needs: SEARCH to find items, GET to fetch details,
  CREATE to make new records, SEND to deliver messages, etc.

### Connection Checking
- Call check_connection for each integration connector you plan to use.
- Even if a connection is missing, still call submit_plan — the runtime handles
  missing connections by prompting the user for OAuth authorization.
- NEVER refuse to submit a plan due to missing connections.

### Planning
- Think about the logical flow: you typically need to discover data first,
  then get details, then act on it.
- Search/list actions return IDs or summaries — the executor agent will need to
  fetch full details before using the data.
- Identify the trigger type: "manual" (default) or "cron" (if user mentions a schedule
  like "every day", "daily", "weekly").

### Output
Call submit_plan EXACTLY ONCE with:
- name: Concise workflow name (max 50 chars)
- triggerType: "manual" or "cron"
- schedule: Cron expression if triggerType is "cron"
- connectors: List of integration connector keys needed
- description: 2-3 sentence summary of what the workflow will do and how
- steps: High-level step descriptions (for user preview). Each step should have:
  - description: What this step does
  - connector: Which integration it uses
  - action: The action name from the catalog

IMPORTANT: Steps are descriptive previews for the user, NOT rigid execution instructions.
The executor agent will determine the actual execution flow dynamically at runtime."""
