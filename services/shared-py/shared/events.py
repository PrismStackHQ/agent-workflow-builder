"""NATS subjects and Pydantic event payload models.

Mirrors libs/shared-types/src/events/subjects.ts and payloads.ts exactly.
"""

from pydantic import BaseModel


# ── NATS Subjects ──────────────────────────────────────────────────────────────

class SUBJECTS:
    # Onboarding
    ORG_CREATED = "onboarding.org.created"
    ORG_UPDATED = "onboarding.org.updated"

    # Connection
    CONNECTION_ENDPOINT_CONFIGURED = "connection.endpoint.configured"
    CONNECTION_REF_CREATED = "connection.ref.created"
    CONNECTION_REF_READY = "connection.ref.ready"
    CONNECTION_OAUTH_REQUIRED = "connection.oauth.required"
    CONNECTION_OAUTH_COMPLETED = "connection.oauth.completed"
    CONNECTION_TOKENS_REQUEST = "connection.tokens.request"

    # RAG
    RAG_CONFIGURED = "rag.configured"
    RAG_QUERY_REQUEST = "rag.query.request"

    # Agent
    AGENT_COMMAND_SUBMITTED = "agent.command.submitted"
    AGENT_PLAN_PREVIEW = "agent.plan.preview"
    AGENT_PLAN_CONFIRMED = "agent.plan.confirmed"
    AGENT_DEFINITION_CREATED = "agent.definition.created"
    AGENT_DEFINITION_READY = "agent.definition.ready"

    # Scheduler
    SCHEDULER_AGENT_SCHEDULED = "scheduler.agent.scheduled"
    SCHEDULER_RUN_TRIGGERED = "scheduler.run.triggered"

    # Runtime
    RUNTIME_RUN_STARTED = "runtime.run.started"
    RUNTIME_RUN_STEP_COMPLETED = "runtime.run.step.completed"
    RUNTIME_RUN_SUCCEEDED = "runtime.run.succeeded"
    RUNTIME_RUN_FAILED = "runtime.run.failed"
    RUNTIME_RUN_PAUSED = "runtime.run.paused"
    RUNTIME_RUN_RESUME_REQUESTED = "runtime.run.resume.requested"
    RUNTIME_RUN_RESUMED = "runtime.run.resumed"
    RUNTIME_RUN_SUB_AGENT_STARTED = "runtime.run.sub_agent.started"
    RUNTIME_RUN_ITERATION_PROGRESS = "runtime.run.iteration.progress"
    RUNTIME_RUN_THINKING = "runtime.run.thinking"

    # Tools
    TOOL_REGISTRY_SYNCED = "tools.registry.synced"

    # Connection completion
    CONNECTION_COMPLETED = "connection.completed"


STREAM_NAME = "AGENT_WORKFLOW"


# ── Event Payloads ─────────────────────────────────────────────────────────────


class AgentCommandSubmittedEvent(BaseModel):
    orgId: str
    workspaceId: str
    commandId: str
    naturalLanguageCommand: str
    endUserId: str | None = None


class AgentPlanPreviewEvent(BaseModel):
    orgId: str
    workspaceId: str
    commandId: str
    name: str
    naturalLanguageCommand: str
    triggerType: str
    schedule: str | None = None
    connectors: list[str]
    steps: list[dict]
    missingConnections: list[dict]
    connectorDisplayNames: dict[str, str] | None = None
    instructions: str | None = None
    endUserId: str | None = None


class AgentPlanConfirmedEvent(BaseModel):
    orgId: str
    workspaceId: str
    commandId: str
    naturalLanguageCommand: str
    name: str
    triggerType: str
    schedule: str | None = None
    connectors: list[str]
    steps: list[dict]
    instructions: str | None = None
    endUserId: str | None = None


class AgentDefinitionCreatedEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str
    name: str
    scheduleCron: str | None = None
    requiredConnections: list[str]
    steps: list[dict]
    status: str


class AgentDefinitionReadyEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str


class AgentRunTriggeredEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str
    runId: str
    endUserConnectionId: str | None = None


class AgentRunStartedEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str
    runId: str
    startedAt: str


class AgentRunStepCompletedEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str
    runId: str
    stepIndex: int
    stepName: str
    stepDescription: str | None = None
    result: dict | list | str | None = None


class AgentRunSucceededEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str
    runId: str
    endedAt: str
    summary: str


class AgentRunFailedEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str
    runId: str
    endedAt: str
    error: str


class AgentRunPausedEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str
    runId: str
    pausedAtStepIndex: int
    reason: str
    integrationKey: str
    actionName: str
    connectionId: str | None = None
    pausedAt: str


class AgentRunResumeRequestedEvent(BaseModel):
    orgId: str
    workspaceId: str
    runId: str
    connectionId: str


class AgentRunResumedEvent(BaseModel):
    orgId: str
    workspaceId: str
    agentId: str
    runId: str
    resumedAt: str


class ConnectionCompletedEvent(BaseModel):
    orgId: str
    workspaceId: str
    integrationKey: str
    connectionId: str
    endUserId: str
