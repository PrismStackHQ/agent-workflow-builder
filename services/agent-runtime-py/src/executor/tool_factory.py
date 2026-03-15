"""Dynamic tool factory — converts ProxyActionDefinition DB rows into LangGraph tools.

Each workspace's proxy actions become callable StructuredTools that the
executor agent can use during its ReAct loop.
"""

import json
import logging
from typing import Any

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field, create_model
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from shared.models import AvailableIntegration, ConnectionRef, ConnectionStatus, CustomerConfig
from shared.nango_client import NangoClient, ProxyActionConfig, ProxyActionRegistry

logger = logging.getLogger(__name__)

# Max chars per tool result — keeps message history within LLM token budget
_MAX_RESULT_CHARS = 4_000
# Max items when result is a list — avoids dumping hundreds of records
_MAX_LIST_ITEMS = 10
# Fields to drop from individual records (large/binary payloads)
_DROP_FIELDS = {"body", "rawBody", "raw", "data", "attachmentData", "content",
                "htmlBody", "textBody", "payload", "parts", "snippet"}


def _trim_result(data: Any) -> Any:
    """Aggressively trim tool results to keep within token budget.

    - Lists: keep first N items, drop heavy fields from each
    - Dicts: drop known-heavy fields (body, raw, attachmentData, etc.)
    - Strings: truncate at _MAX_RESULT_CHARS
    """
    if data is None:
        return data

    if isinstance(data, list):
        trimmed = [_trim_record(item) for item in data[:_MAX_LIST_ITEMS]]
        if len(data) > _MAX_LIST_ITEMS:
            trimmed.append(f"...and {len(data) - _MAX_LIST_ITEMS} more items (not shown)")
        return trimmed

    if isinstance(data, dict):
        return _trim_record(data)

    if isinstance(data, str) and len(data) > _MAX_RESULT_CHARS:
        return data[:_MAX_RESULT_CHARS] + "...[truncated]"

    return data


def _trim_record(record: Any) -> Any:
    """Trim a single record dict — drop heavy fields, truncate long strings."""
    if not isinstance(record, dict):
        return record

    result = {}
    for k, v in record.items():
        # Drop known-heavy fields entirely
        if k in _DROP_FIELDS:
            result[k] = f"[{k} omitted — use a get/detail tool to fetch full content]"
            continue
        # Recursively trim nested dicts
        if isinstance(v, dict):
            result[k] = _trim_record(v)
        # Trim nested lists
        elif isinstance(v, list):
            if len(v) > 5:
                result[k] = [_trim_record(i) if isinstance(i, dict) else i for i in v[:5]]
                result[k].append(f"...and {len(v) - 5} more")
            else:
                result[k] = [_trim_record(i) if isinstance(i, dict) else i for i in v]
        # Truncate long strings
        elif isinstance(v, str) and len(v) > 500:
            result[k] = v[:500] + "...[truncated]"
        else:
            result[k] = v
    return result


def _json_schema_to_pydantic(
    schema: dict | None,
    model_name: str = "ToolInput",
) -> type[BaseModel]:
    """Convert a JSON Schema dict to a Pydantic model for tool args.

    Handles simple flat schemas; nested objects become dict fields.
    """
    if not schema or not schema.get("properties"):
        # Fallback: accept arbitrary kwargs
        return create_model(model_name, **{"kwargs": (dict, Field(default_factory=dict))})

    fields: dict[str, Any] = {}
    required = set(schema.get("required", []))
    props = schema.get("properties", {})

    for name, prop in props.items():
        ptype = prop.get("type", "string")
        desc = prop.get("description", "")

        if ptype == "string":
            py_type = str
        elif ptype in ("number", "integer"):
            py_type = float if ptype == "number" else int
        elif ptype == "boolean":
            py_type = bool
        elif ptype == "array":
            py_type = list
        elif ptype == "object":
            py_type = dict
        else:
            py_type = str

        if name in required:
            fields[name] = (py_type, Field(description=desc))
        else:
            fields[name] = (py_type | None, Field(default=None, description=desc))

    return create_model(model_name, **fields)


async def _resolve_connection(
    db: AsyncSession,
    workspace_id: str,
    connector: str,
    end_user_id: str,
) -> dict | None:
    """Resolve a ConnectionRef for a connector, matching runtime.service.ts logic."""
    where_base = [
        ConnectionRef.workspaceId == workspace_id,
        ConnectionRef.status == ConnectionStatus.READY,
    ]
    if end_user_id:
        where_base.append(ConnectionRef.externalRefId == end_user_id)

    # Exact match
    result = await db.execute(
        select(ConnectionRef).where(
            *where_base,
            ConnectionRef.providerConfigKey == connector,
        ).limit(1)
    )
    exact = result.scalar_one_or_none()
    if exact and exact.connectionId:
        return {"connectionId": exact.connectionId, "providerConfigKey": exact.providerConfigKey}

    # Resolve via AvailableIntegration
    ai_result = await db.execute(
        select(AvailableIntegration).where(
            AvailableIntegration.workspaceId == workspace_id
        )
    )
    integrations = ai_result.scalars().all()
    connector_lower = connector.lower()

    for ai in integrations:
        meta = ai.rawMetadata or {}
        nango_provider = str(meta.get("provider", "")).lower()
        display_lower = ai.displayName.lower().replace(" ", "-")
        pk_lower = ai.providerConfigKey.lower()

        if any([
            pk_lower == connector_lower,
            nango_provider == connector_lower,
            display_lower == connector_lower,
            connector_lower in nango_provider,
            nango_provider in connector_lower,
        ]):
            ref_result = await db.execute(
                select(ConnectionRef).where(
                    *where_base,
                    ConnectionRef.providerConfigKey == ai.providerConfigKey,
                ).limit(1)
            )
            ref = ref_result.scalar_one_or_none()
            if ref and ref.connectionId:
                return {"connectionId": ref.connectionId, "providerConfigKey": ref.providerConfigKey}

    return None


async def build_workspace_tools(
    db: AsyncSession,
    workspace_id: str,
    end_user_id: str,
    nango: NangoClient,
    connectors: list[str] | None = None,
) -> list[StructuredTool]:
    """Load proxy actions for a workspace and create callable LangGraph tools.

    If connectors is provided, only tools for those connector keys are included.
    This keeps the tool count (and token usage) manageable.
    """

    # Get workspace Nango config
    config_result = await db.execute(
        select(CustomerConfig).where(CustomerConfig.workspaceId == workspace_id)
    )
    ws_config = config_result.scalar_one_or_none()
    if not ws_config or not ws_config.connectionEndpointUrl or not ws_config.connectionEndpointApiKey:
        logger.warning(f"No integration config for workspace {workspace_id}")
        return []

    base_url = ws_config.connectionEndpointUrl
    api_key = ws_config.connectionEndpointApiKey

    # Load proxy action registry
    registry = ProxyActionRegistry(db)
    await registry.ensure_loaded(workspace_id)
    configs = registry.get_all(workspace_id)

    # Filter to only the connectors needed by this plan
    if connectors:
        connector_set = {c.lower() for c in connectors}
        configs = [c for c in configs if c.provider_config_key.lower() in connector_set]

    tools = []
    for config in configs:
        tool = _create_proxy_tool(
            config, nango, db, workspace_id, end_user_id, base_url, api_key
        )
        tools.append(tool)

    logger.info(f"Built {len(tools)} workspace tools for {workspace_id} (filtered from connectors={connectors})")
    return tools


def _create_proxy_tool(
    config: ProxyActionConfig,
    nango: NangoClient,
    db: AsyncSession,
    workspace_id: str,
    end_user_id: str,
    base_url: str,
    api_key: str,
) -> StructuredTool:
    """Create a single StructuredTool from a ProxyActionConfig."""

    # Clean tool name: replace dashes/dots with underscores
    tool_name = f"{config.provider_config_key}__{config.action_name}".replace("-", "_").replace(".", "_")
    description = f"{config.display_name}: {config.description}"

    # Build args schema from inputSchema
    args_model = _json_schema_to_pydantic(
        config.input_schema,
        model_name=f"{tool_name}_Input",
    )

    async def execute_tool(**kwargs) -> str:
        # Remove None values
        inp = {k: v for k, v in kwargs.items() if v is not None}
        # Remove the fallback 'kwargs' field if present
        if "kwargs" in inp and isinstance(inp["kwargs"], dict):
            inp.update(inp.pop("kwargs"))

        # Resolve connection
        conn = await _resolve_connection(db, workspace_id, config.provider_config_key, end_user_id)
        if not conn:
            return json.dumps({
                "error": f"No connection available for {config.provider_config_key}. "
                         f"The user needs to connect this integration first."
            })

        # Execute via Nango proxy
        try:
            result = await nango.execute_proxy(
                base_url, api_key, conn["connectionId"],
                config.provider_config_key, config, inp,
            )
            if not result.get("success"):
                return json.dumps({"error": result.get("error", "Unknown error")})

            data = result.get("data")
            # Trim large results to stay within LLM token budget
            data = _trim_result(data)
            data_str = json.dumps(data, default=str)
            if len(data_str) > 4_000:
                data_str = data_str[:4_000] + "\n...[truncated]"
            return data_str

        except Exception as e:
            return json.dumps({"error": str(e)})

    return StructuredTool.from_function(
        coroutine=execute_tool,
        name=tool_name,
        description=description[:500],  # LangGraph has desc limits
        args_schema=args_model,
    )
