"""SQLAlchemy ORM models mirroring the Prisma schema.

Prisma uses camelCase column names in PostgreSQL by default (no @map directives),
so all Column names here use camelCase to match exactly.

Prisma creates named PostgreSQL ENUMs — we must reference them by name
using SQLAlchemy's Enum(... , name=..., create_type=False) so the generated
SQL casts values to the correct enum type instead of VARCHAR.
"""

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


# ── Python Enums (for type safety) ────────────────────────────────────────────


class IntegrationProvider(str, enum.Enum):
    NANGO = "NANGO"
    UNIPILE = "UNIPILE"
    MERGE = "MERGE"


class ConnectionStatus(str, enum.Enum):
    PENDING = "PENDING"
    OAUTH_REQUIRED = "OAUTH_REQUIRED"
    READY = "READY"
    FAILED = "FAILED"


class AgentStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    WAITING_CONNECTIONS = "WAITING_CONNECTIONS"
    READY = "READY"
    SCHEDULED = "SCHEDULED"
    PAUSED = "PAUSED"
    FAILED = "FAILED"


class RunStatus(str, enum.Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


# ── SQLAlchemy Enum column types (referencing existing PG enums) ──────────────

IntegrationProviderType = SAEnum(
    IntegrationProvider,
    name="IntegrationProvider",
    create_type=False,
)
ConnectionStatusType = SAEnum(
    ConnectionStatus,
    name="ConnectionStatus",
    create_type=False,
)
AgentStatusType = SAEnum(
    AgentStatus,
    name="AgentStatus",
    create_type=False,
)
RunStatusType = SAEnum(
    RunStatus,
    name="RunStatus",
    create_type=False,
)


# ── Models ─────────────────────────────────────────────────────────────────────


class Organization(Base):
    __tablename__ = "Organization"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    orgEmail: Mapped[str] = mapped_column(String, unique=True)
    firebaseUid: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())
    deletedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Workspace(Base):
    __tablename__ = "Workspace"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    orgId: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    apiKey: Mapped[str] = mapped_column(String, unique=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())
    deletedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class CustomerConfig(Base):
    __tablename__ = "CustomerConfig"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspaceId: Mapped[str] = mapped_column(String, unique=True)
    integrationProvider: Mapped[str | None] = mapped_column(IntegrationProviderType, nullable=True)
    connectionEndpointUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    connectionEndpointApiKey: Mapped[str | None] = mapped_column(String, nullable=True)
    ragEndpointUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    ragEndpointApiKey: Mapped[str | None] = mapped_column(String, nullable=True)
    lastSyncedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())


class AvailableIntegration(Base):
    __tablename__ = "AvailableIntegration"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspaceId: Mapped[str] = mapped_column(String)
    integrationProvider: Mapped[str] = mapped_column(IntegrationProviderType)
    providerKey: Mapped[str] = mapped_column(String)
    displayName: Mapped[str] = mapped_column(String)
    logoUrl: Mapped[str | None] = mapped_column(String, nullable=True)
    rawMetadata: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())


class ConnectionRef(Base):
    __tablename__ = "ConnectionRef"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspaceId: Mapped[str] = mapped_column(String)
    provider: Mapped[str] = mapped_column(String)
    externalRefId: Mapped[str] = mapped_column(String)
    connectionId: Mapped[str | None] = mapped_column(String, nullable=True)
    metadata_: Mapped[Any | None] = mapped_column("metadata", JSON, nullable=True)
    status: Mapped[str] = mapped_column(ConnectionStatusType, default=ConnectionStatus.PENDING)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())


class AgentDefinition(Base):
    __tablename__ = "AgentDefinition"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspaceId: Mapped[str] = mapped_column(String)
    name: Mapped[str] = mapped_column(String)
    naturalLanguageCommand: Mapped[str] = mapped_column(String)
    endUserId: Mapped[str | None] = mapped_column(String, nullable=True)
    scheduleCron: Mapped[str | None] = mapped_column(String, nullable=True)
    triggerType: Mapped[str] = mapped_column(String, default="cron")
    requiredConnections: Mapped[Any] = mapped_column(JSON, default=list)
    steps: Mapped[Any] = mapped_column(JSON, default=list)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    planDescription: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(AgentStatusType, default=AgentStatus.DRAFT)
    k8sCronJobName: Mapped[str | None] = mapped_column(String, nullable=True)
    k8sNamespace: Mapped[str | None] = mapped_column(String, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())


class AgentRun(Base):
    __tablename__ = "AgentRun"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    agentId: Mapped[str] = mapped_column(String)
    startedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    endedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(RunStatusType, default=RunStatus.PENDING)
    stepsCompleted: Mapped[int] = mapped_column(Integer, default=0)
    logsPointer: Mapped[str | None] = mapped_column(String, nullable=True)
    errorMessage: Mapped[str | None] = mapped_column(String, nullable=True)
    endUserConnectionId: Mapped[str | None] = mapped_column(String, nullable=True)
    pausedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    pausedAtStepIndex: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pauseReason: Mapped[str | None] = mapped_column(String, nullable=True)
    pauseMetadata: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    parentRunId: Mapped[str | None] = mapped_column(String, nullable=True)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    resumedAt: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ToolRegistryEntry(Base):
    __tablename__ = "ToolRegistryEntry"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspaceId: Mapped[str] = mapped_column(String)
    integrationProvider: Mapped[str] = mapped_column(IntegrationProviderType)
    integrationKey: Mapped[str] = mapped_column(String)
    actionName: Mapped[str] = mapped_column(String)
    displayName: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    type: Mapped[str | None] = mapped_column(String, nullable=True)
    inputSchema: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    outputSchema: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    rawDefinition: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    syncedAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())


class ProxyActionDefinition(Base):
    __tablename__ = "ProxyActionDefinition"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    workspaceId: Mapped[str] = mapped_column(String)
    providerConfigKey: Mapped[str] = mapped_column(String)
    actionName: Mapped[str] = mapped_column(String)
    actionType: Mapped[str] = mapped_column(String)
    displayName: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    type: Mapped[str] = mapped_column(String, default="proxy")
    method: Mapped[str] = mapped_column(String)
    endpoint: Mapped[str] = mapped_column(String)
    paramsConfig: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    bodyConfig: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    headersConfig: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    responseConfig: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    postProcessConfig: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    transformerName: Mapped[str | None] = mapped_column(String, nullable=True)
    inputSchema: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    outputSchema: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    isEnabled: Mapped[bool] = mapped_column(Boolean, default=True)
    isDefault: Mapped[bool] = mapped_column(Boolean, default=False)
    createdAt: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updatedAt: Mapped[datetime] = mapped_column(DateTime, onupdate=func.now())
