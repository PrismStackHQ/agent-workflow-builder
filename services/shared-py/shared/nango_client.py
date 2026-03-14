"""Nango HTTP client and proxy action registry.

Ports:
- libs/integration-provider/src/providers/nango.provider.ts
- libs/integration-provider/src/proxy/proxy-action.registry.ts
- libs/integration-provider/src/proxy/declarative-config-interpreter.ts
"""

import base64
import json
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import urlencode, quote

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import CustomerConfig, ProxyActionDefinition

logger = logging.getLogger(__name__)


# ── ProxyActionConfig ──────────────────────────────────────────────────────────

ParamsBuilder = Callable[[dict[str, Any]], dict[str, str]]
BodyBuilder = Callable[[dict[str, Any]], dict[str, Any]]
HeadersBuilder = Callable[[dict[str, Any]], dict[str, str]]
ResponseMapper = Callable[[Any], Any]
PostProcessor = Callable[[Any, Any], Any]  # (data, proxy_fetch) -> data


@dataclass
class ProxyActionConfig:
    provider_config_key: str
    action_name: str
    action_type: str
    display_name: str
    description: str
    method: str
    endpoint: str
    input_schema: dict | None = None
    output_schema: dict | None = None
    params_builder: ParamsBuilder | None = None
    body_builder: BodyBuilder | None = None
    headers_builder: HeadersBuilder | None = None
    response_mapper: ResponseMapper | None = None
    post_processor: PostProcessor | None = None


# ── Output Schema Filter ──────────────────────────────────────────────────────


def _extract_schema_field_names(schema: dict) -> set[str]:
    """Extract top-level property names from a JSON Schema (object or array of objects)."""
    props = None
    if schema.get("type") == "array":
        props = (schema.get("items") or {}).get("properties")
    elif schema.get("type") == "object":
        props = schema.get("properties")
    else:
        props = schema.get("properties")
    return set(props.keys()) if props else set()


def _filter_by_output_schema(data: Any, schema: dict) -> Any:
    """Filter response data to only include fields defined in outputSchema."""
    schema_type = schema.get("type")

    if schema_type == "array":
        props = (schema.get("items") or {}).get("properties")
        if props and isinstance(data, list):
            keys = set(props.keys())
            return [
                {k: v for k, v in item.items() if k in keys}
                for item in data
                if isinstance(item, dict)
            ]
        return data

    if schema_type == "object":
        props = schema.get("properties")
        if props and isinstance(data, dict):
            keys = set(props.keys())
            return {k: v for k, v in data.items() if k in keys}
        return data

    # If schema has properties at top level without explicit type
    props = schema.get("properties")
    if props:
        if isinstance(data, dict):
            keys = set(props.keys())
            return {k: v for k, v in data.items() if k in keys}
        if isinstance(data, list):
            keys = set(props.keys())
            return [
                {k: v for k, v in item.items() if k in keys}
                for item in data
                if isinstance(item, dict)
            ]

    return data


# ── DeclarativeConfigInterpreter ──────────────────────────────────────────────


class DeclarativeConfigInterpreter:
    """Converts ProxyActionDefinition DB rows into ProxyActionConfig objects."""

    def interpret(self, row: ProxyActionDefinition) -> ProxyActionConfig:
        # Auto-enrich inputSchema with fields from queryBuilder/bodyTemplate
        enriched_input_schema = self._enrich_input_schema(
            row.inputSchema, row.paramsConfig, row.bodyConfig, row.endpoint,
        )

        config = ProxyActionConfig(
            provider_config_key=row.providerConfigKey,
            action_name=row.actionName,
            action_type=row.actionType,
            display_name=row.displayName,
            description=row.description or "",
            method=row.method,
            endpoint=row.endpoint,
            input_schema=enriched_input_schema,
            output_schema=row.outputSchema,
        )

        # Auto-generate mappings from inputSchema extended fields (mapTo, aliases, default, wrapArray)
        params_cfg = dict(row.paramsConfig) if row.paramsConfig else None
        body_cfg = dict(row.bodyConfig) if row.bodyConfig else None
        is_body_method = row.method in ("POST", "PUT", "PATCH")

        if enriched_input_schema:
            auto_mappings = self._extract_input_mappings(
                enriched_input_schema, row.endpoint, params_cfg, body_cfg,
            )
            if auto_mappings:
                if is_body_method:
                    if body_cfg is None:
                        body_cfg = {}
                    body_cfg["mappings"] = body_cfg.get("mappings", []) + auto_mappings
                else:
                    if params_cfg is None:
                        params_cfg = {}
                    params_cfg["mappings"] = params_cfg.get("mappings", []) + auto_mappings

        config.params_builder = self._build_params_builder(params_cfg, row.outputSchema)
        config.body_builder = self._build_body_builder(body_cfg)
        config.headers_builder = self._build_headers_builder(row.headersConfig)
        config.response_mapper = self._build_response_mapper(row.responseConfig)
        config.post_processor = self._build_post_processor(row.postProcessConfig)

        return config

    def _enrich_input_schema(
        self, input_schema: dict | None, params_cfg: dict | None,
        body_cfg: dict | None, endpoint: str,
    ) -> dict | None:
        """Auto-enrich inputSchema with fields from queryBuilder/bodyTemplate
        so the LLM planner knows about dynamically added parameters."""
        referenced: set[str] = set()
        if params_cfg and params_cfg.get("queryBuilder"):
            for part in params_cfg["queryBuilder"].get("parts", []):
                if part.get("when"):
                    referenced.add(part["when"])
        if body_cfg and body_cfg.get("template"):
            for v in body_cfg["template"].values():
                if isinstance(v, str):
                    referenced.update(re.findall(r"\{\{(\w+)\}\}", v))
        if not referenced:
            return input_schema

        path_params = set(re.findall(r"\{\{(\w+)\}\}", endpoint))
        schema = json.loads(json.dumps(input_schema)) if input_schema else {"type": "object", "properties": {}}
        if "properties" not in schema:
            schema["properties"] = {}

        for field in referenced:
            if field in path_params:
                continue
            if field in schema["properties"]:
                continue
            # Auto-generate a property for this field
            label = re.sub(r"([A-Z])", r" \1", field).lower().strip()
            schema["properties"][field] = {
                "type": "string",
                "description": f"Filter by {label}",
            }
        return schema

    def _extract_input_mappings(
        self, input_schema: dict, endpoint: str,
        params_cfg: dict | None, body_cfg: dict | None,
    ) -> list[dict]:
        """Extract auto-mappings from inputSchema properties with extended fields."""
        props = (input_schema or {}).get("properties")
        if not props:
            return []

        # Collect fields handled elsewhere
        path_params = set(re.findall(r"\{\{(\w+)\}\}", endpoint))
        qb_fields = set()
        if params_cfg and params_cfg.get("queryBuilder"):
            for part in params_cfg["queryBuilder"].get("parts", []):
                if part.get("when"):
                    qb_fields.add(part["when"])
        template_fields = set()
        if body_cfg and body_cfg.get("template"):
            for v in body_cfg["template"].values():
                if isinstance(v, str):
                    template_fields.update(re.findall(r"\{\{(\w+)\}\}", v))
        explicit_froms = set()
        for m in (params_cfg or {}).get("mappings", []):
            explicit_froms.add(m["from"])
        for m in (body_cfg or {}).get("mappings", []):
            explicit_froms.add(m["from"])

        mappings = []
        for key, prop in props.items():
            if key in path_params or key in qb_fields or key in template_fields or key in explicit_froms:
                continue
            if not isinstance(prop, dict):
                continue
            map_to = prop.get("mapTo")
            aliases = prop.get("aliases")
            default = prop.get("default")
            wrap_array = prop.get("wrapArray")
            # Only auto-map if property has mapping metadata
            if not map_to and not aliases and default is None and not wrap_array:
                continue
            m: dict[str, Any] = {"from": key, "to": map_to or key}
            if aliases:
                m["aliases"] = aliases
            if default is not None:
                m["default"] = default
            if wrap_array:
                m["wrapArray"] = True
            mappings.append(m)
        return mappings

    def _build_params_builder(self, cfg: Any, output_schema: Any = None) -> ParamsBuilder | None:
        if not cfg:
            return None

        def builder(inp: dict) -> dict[str, str]:
            result: dict[str, str] = {}
            if cfg.get("defaults"):
                result.update(cfg["defaults"])
            # Auto-derive fields param from outputSchema
            fp = cfg.get("fieldsParam")
            if fp and output_schema:
                field_names = _extract_schema_field_names(output_schema)
                if field_names:
                    sorted_fields = ",".join(sorted(field_names))
                    wrapper = fp.get("wrapper")
                    result[fp["paramName"]] = f"{wrapper}({sorted_fields})" if wrapper else sorted_fields
            for m in cfg.get("mappings", []):
                all_keys = [m["from"]] + m.get("aliases", [])
                val = None
                for k in all_keys:
                    if inp.get(k) is not None:
                        raw = inp[k]
                        # Coerce floats to integers for numeric params (e.g. 10.0 → "10")
                        val = str(int(raw)) if isinstance(raw, float) else str(raw)
                        break
                if val is not None:
                    result[m["to"]] = val
                elif m.get("default") is not None:
                    result[m["to"]] = m["default"]
            qb = cfg.get("queryBuilder")
            if qb:
                parts = []
                for part in qb["parts"]:
                    if part.get("literal"):
                        parts.append(part["literal"])
                    elif part.get("template") and part.get("when"):
                        v = inp.get(part["when"])
                        if v is not None and str(v).strip():
                            t = re.sub(r"\{\{(\w+)\}\}", lambda m: str(inp.get(m.group(1), "")), part["template"])
                            parts.append(t)
                if parts:
                    result[qb["target"]] = qb["join"].join(parts)
            return result

        return builder

    def _build_body_builder(self, cfg: Any) -> BodyBuilder | None:
        if not cfg:
            return None

        def builder(inp: dict) -> dict[str, Any]:
            # MIME encode for email sending
            if cfg.get("mimeEncode"):
                return self._build_mime_message(inp)

            result: dict[str, Any] = {}
            if cfg.get("defaults"):
                result.update(cfg["defaults"])
            if cfg.get("template"):
                for k, v in cfg["template"].items():
                    if isinstance(v, str) and v.startswith("{{") and v.endswith("}}"):
                        ik = v[2:-2]
                        if inp.get(ik) is not None:
                            result[k] = inp[ik]
                    else:
                        result[k] = v
            for m in cfg.get("mappings", []):
                all_keys = [m["from"]] + m.get("aliases", [])
                found = False
                for k in all_keys:
                    if inp.get(k) is not None:
                        val = inp[k]
                        if m.get("wrapArray") and not isinstance(val, list):
                            val = [val]
                        result[m["to"]] = val
                        found = True
                        break
                if not found and m.get("default") is not None:
                    result[m["to"]] = m["default"]
            return result

        return builder

    @staticmethod
    def _build_mime_message(inp: dict) -> dict[str, Any]:
        """Build RFC2822 MIME message for email sending."""
        if inp.get("raw") and not inp.get("to"):
            return {"raw": inp["raw"]}
        to = str(inp.get("to", ""))
        subject = str(inp.get("subject", "(no subject)"))
        body = str(inp.get("body") or inp.get("text") or inp.get("content") or "")

        attachment_path = inp.get("attachmentPath") or inp.get("attachment") or inp.get("filePath")
        logger.info(f"mimeEncode: to={to}, subject={subject}, attachmentPath={attachment_path}")

        if attachment_path and os.path.isfile(str(attachment_path).strip()):
            from email.mime.base import MIMEBase
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
            from email import encoders
            import mimetypes

            attachment_path = str(attachment_path).strip()
            msg = MIMEMultipart()
            msg["To"] = to
            if inp.get("cc"):
                msg["Cc"] = str(inp["cc"])
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain", "utf-8"))

            filename = os.path.basename(attachment_path)
            mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
            maintype, subtype = mime_type.split("/", 1)
            with open(attachment_path, "rb") as f:
                attachment = MIMEBase(maintype, subtype)
                attachment.set_payload(f.read())
            encoders.encode_base64(attachment)
            attachment.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(attachment)

            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode().rstrip("=")
            logger.info(f"mimeEncode: built MIME multipart with attachment '{filename}' ({len(raw)} chars)")
            return {"raw": raw}
        else:
            cc = f"Cc: {inp['cc']}\r\n" if inp.get("cc") else ""
            message = f"To: {to}\r\n{cc}Subject: {subject}\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\n\r\n{body}"
            raw = base64.urlsafe_b64encode(message.encode()).decode().rstrip("=")
            logger.info(f"mimeEncode: built plain text message ({len(raw)} chars)")
            return {"raw": raw}

    def _build_headers_builder(self, cfg: Any) -> HeadersBuilder | None:
        if not cfg or not cfg.get("static"):
            return None
        static = cfg["static"]
        return lambda _: dict(static)

    @staticmethod
    def _get_nested_value(obj: Any, path: str) -> Any:
        """Navigate nested path like 'payload.headers'."""
        for key in path.split("."):
            if isinstance(obj, dict):
                obj = obj.get(key)
            else:
                return None
        return obj

    @staticmethod
    def _apply_extract_headers(data: Any, eh: dict) -> dict[str, str]:
        """Extract values from a key-value array (e.g., Gmail payload.headers)."""
        arr = DeclarativeConfigInterpreter._get_nested_value(data, eh["path"])
        if not isinstance(arr, list):
            return {}
        result: dict[str, str] = {}
        for header_name, output_key in eh["pick"].items():
            found = next(
                (h[eh["valueField"]] for h in arr
                 if isinstance(h, dict) and h.get(eh["keyField"], "").lower() == header_name.lower()),
                "",
            )
            result[output_key] = found
        return result

    def _build_response_mapper(self, cfg: Any) -> ResponseMapper | None:
        if not cfg:
            return None

        def mapper(data: Any) -> Any:
            # Complex single-object mapping (extractHeaders + mergeFields + bodyExtract + attachmentExtract)
            if cfg.get("extractHeaders") or cfg.get("mergeFields") or cfg.get("bodyExtract") or cfg.get("attachmentExtract"):
                mapped: dict[str, Any] = {}

                if cfg.get("extractHeaders"):
                    mapped.update(self._apply_extract_headers(data, cfg["extractHeaders"]))

                if cfg.get("mergeFields"):
                    for from_key, to_key in cfg["mergeFields"].items():
                        if isinstance(data, dict):
                            mapped[to_key] = data.get(from_key)

                if cfg.get("bodyExtract"):
                    be = cfg["bodyExtract"]
                    parts = self._get_nested_value(data, be["partsPath"])
                    body_data = ""
                    if isinstance(parts, list):
                        match = next((p for p in parts if p.get("mimeType") == be["mimeType"]), None)
                        body_data = match.get("body", {}).get("data", "") if match else ""
                    if not body_data:
                        body_data = self._get_nested_value(data, be["fallbackPath"]) or ""
                    mapped[be["outputField"]] = body_data

                if cfg.get("attachmentExtract"):
                    ae = cfg["attachmentExtract"]
                    parts = self._get_nested_value(data, ae["partsPath"]) or []
                    attachments = [
                        {
                            "filename": p[ae["filenameField"]],
                            "mimeType": p.get("mimeType"),
                            "attachmentId": (p.get("body") or {}).get("attachmentId"),
                            "size": (p.get("body") or {}).get("size"),
                        }
                        for p in parts if isinstance(p, dict) and p.get(ae["filenameField"])
                    ] if isinstance(parts, list) else []
                    mapped[ae["outputField"]] = attachments
                    if ae.get("hasField"):
                        mapped[ae["hasField"]] = len(attachments) > 0

                return mapped

            # Standard response mapping
            result = data
            if cfg.get("rootPath"):
                result = (data or {}).get(cfg["rootPath"], [])
            if cfg.get("flatten") and isinstance(result, list):
                flat = []
                for item in result:
                    if isinstance(item, list):
                        flat.extend(item)
                    else:
                        flat.append(item)
                result = flat
            if cfg.get("pick") and isinstance(result, list):
                result = [
                    {f: item.get(f) for f in cfg["pick"]}
                    for item in result if isinstance(item, dict)
                ]
            return result

        return mapper

    def _build_post_processor(self, cfg: Any) -> PostProcessor | None:
        if not cfg or not cfg.get("enrichment"):
            return None
        enrich = cfg["enrichment"]

        async def processor(data: Any, proxy_fetch: Any) -> Any:
            items = data if isinstance(data, list) else []
            if not items:
                return items
            limit = enrich.get("limit", 10)
            enriched = []
            for item in items[:limit]:
                try:
                    endpoint = re.sub(
                        r"\{\{(\w+)\}\}",
                        lambda m: str(item.get(m.group(1), "")),
                        enrich["endpoint"],
                    )
                    detail = await proxy_fetch("GET", endpoint, enrich.get("params"))
                    merged = dict(item)
                    for f in enrich.get("merge", []):
                        if detail.get(f) is not None:
                            merged[f] = detail[f]
                    # Extract from key-value arrays (e.g., Gmail headers)
                    if enrich.get("extractHeaders"):
                        merged.update(self._apply_extract_headers(detail, enrich["extractHeaders"]))
                    enriched.append(merged)
                except Exception:
                    enriched.append(item)
            return enriched

        return processor


# ── ProxyActionRegistry ───────────────────────────────────────────────────────


# Default action name aliases (same as TS proxy-action.registry.ts)
_DEFAULT_ALIASES: dict[str, str] = {
    "documents": "search_files", "files": "search_files",
    "search_documents": "search_files", "find_files": "search_files",
    "find_documents": "search_files", "create_directory": "create_folder",
    "new_folder": "create_folder", "mkdir": "create_folder",
    "upload": "upload_file", "copy_file": "upload_file", "save_file": "upload_file",
    "emails": "search_emails", "mail": "search_emails",
    "find_emails": "search_emails", "messages": "list_emails",
    "email_details": "get_email", "read_email": "get_email",
    "download_attachment": "get_attachment", "send-email": "send_email",
    "compose_email": "send_email", "send_message": "post_message",
    "channels": "list_channels", "pages": "search",
    "find_pages": "search", "search_pages": "search",
    "repos": "list_repos", "repositories": "list_repos",
    "issues": "search_issues", "find_issues": "search_issues",
}


class ProxyActionRegistry:
    """Workspace-scoped registry of proxy action configurations with caching."""

    CACHE_TTL = 300  # 5 minutes

    def __init__(self, db: AsyncSession):
        self._db = db
        self._interpreter = DeclarativeConfigInterpreter()
        self._cache: dict[str, dict] = {}  # workspace_id -> {configs, aliases, loaded_at}

    def _key(self, provider: str, action: str) -> str:
        return f"{provider}::{action}"

    async def ensure_loaded(self, workspace_id: str) -> None:
        cached = self._cache.get(workspace_id)
        if cached and time.time() - cached["loaded_at"] < self.CACHE_TTL:
            return
        await self.load_for_workspace(workspace_id)

    async def load_for_workspace(self, workspace_id: str) -> None:
        result = await self._db.execute(
            select(ProxyActionDefinition).where(
                ProxyActionDefinition.workspaceId == workspace_id,
                ProxyActionDefinition.isEnabled == True,
            )
        )
        rows = result.scalars().all()

        configs: dict[str, ProxyActionConfig] = {}
        for row in rows:
            cfg = self._interpreter.interpret(row)
            configs[self._key(cfg.provider_config_key, cfg.action_name)] = cfg

        self._cache[workspace_id] = {
            "configs": configs,
            "aliases": dict(_DEFAULT_ALIASES),
            "loaded_at": time.time(),
        }
        providers = set(c.provider_config_key for c in configs.values())
        logger.info(f"Loaded {len(configs)} proxy actions for workspace {workspace_id} (providers: {', '.join(providers)})")

    def invalidate(self, workspace_id: str) -> None:
        self._cache.pop(workspace_id, None)

    def find(self, workspace_id: str, provider: str, action: str) -> ProxyActionConfig | None:
        cached = self._cache.get(workspace_id)
        if not cached:
            return None

        # Exact match
        exact = cached["configs"].get(self._key(provider, action))
        if exact:
            return exact

        # Alias match
        resolved = cached["aliases"].get(action)
        if resolved:
            alias_match = cached["configs"].get(self._key(provider, resolved))
            if alias_match:
                return alias_match

        # Fallback: first SEARCH action for provider
        for cfg in cached["configs"].values():
            if cfg.provider_config_key == provider and cfg.action_type == "SEARCH":
                logger.warning(f"No exact match for {provider}::{action}, falling back to SEARCH action {cfg.action_name}")
                return cfg

        return None

    def get_all(self, workspace_id: str) -> list[ProxyActionConfig]:
        cached = self._cache.get(workspace_id)
        if not cached:
            return []
        return list(cached["configs"].values())


# ── NangoClient ───────────────────────────────────────────────────────────────


class NangoClient:
    """HTTP client for Nango proxy and action APIs."""

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=30.0)

    @staticmethod
    def _base_url(endpoint_url: str) -> str:
        from urllib.parse import urlparse
        p = urlparse(endpoint_url)
        return f"{p.scheme}://{p.netloc}"

    async def check_connection(
        self, base_url: str, api_key: str, connection_id: str, integration_key: str
    ) -> bool:
        nango_base = self._base_url(base_url)
        try:
            resp = await self._client.get(
                f"{nango_base}/connections",
                params={"connectionId": connection_id},
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if resp.status_code != 200:
                return False
            connections = resp.json().get("connections", [])
            for c in connections:
                if c.get("provider_config_key") == integration_key or c.get("provider") == integration_key:
                    if not c.get("errors"):
                        return True
            return False
        except Exception as e:
            logger.error(f"Connection check failed: {e}")
            return False

    async def execute_proxy(
        self,
        base_url: str,
        api_key: str,
        connection_id: str,
        provider_config_key: str,
        config: ProxyActionConfig,
        inp: dict[str, Any],
    ) -> dict[str, Any]:
        nango_base = self._base_url(base_url)

        # Resolve {{param}} placeholders in endpoint
        endpoint = config.endpoint

        def replace_param(m: re.Match) -> str:
            param_name = m.group(1)
            value = inp.get(param_name)
            if value is None:
                raise ValueError(f"Missing required path parameter: {param_name}")
            if isinstance(value, list):
                logger.warning(f"Path param '{param_name}' is list ({len(value)} items), using first")
                value = value[0]
            return quote(str(value), safe="")

        endpoint = re.sub(r"\{\{(\w+)\}\}", replace_param, endpoint)

        # Query params
        query_params = config.params_builder(inp) if config.params_builder else {}

        qs = urlencode(query_params) if query_params else ""
        full_url = f"{nango_base}/proxy{endpoint}?{qs}" if qs else f"{nango_base}/proxy{endpoint}"

        # Headers
        headers: dict[str, str] = {
            "Authorization": f"Bearer {api_key}",
            "Connection-Id": connection_id,
            "Provider-Config-Key": provider_config_key,
        }
        if config.headers_builder:
            headers.update(config.headers_builder(inp))

        # Body
        body = None
        if config.method in ("POST", "PUT", "PATCH") and config.body_builder:
            headers["Content-Type"] = "application/json"
            body = config.body_builder(inp)

        logger.info(f"Nango proxy {config.method} {endpoint} [{config.action_type}] for {provider_config_key}")

        resp = await self._client.request(
            config.method, full_url, headers=headers,
            json=body if body else None,
        )
        data = resp.json()

        if resp.status_code >= 400:
            error = data.get("error") or data.get("message") or f"Nango proxy error: {resp.status_code}"
            if isinstance(error, dict):
                error = json.dumps(error)
            return {"success": False, "error": str(error), "statusCode": resp.status_code}

        # Response mapper
        mapped = config.response_mapper(data) if config.response_mapper else data

        # Post-processor
        if config.post_processor:
            async def proxy_fetch(method: str, ep: str, params: dict | None = None):
                qs = urlencode(params) if params else ""
                url = f"{nango_base}/proxy{ep}?{qs}" if qs else f"{nango_base}/proxy{ep}"
                r = await self._client.request(method, url, headers=headers)
                return r.json()

            mapped = await config.post_processor(mapped, proxy_fetch)

        # Filter output by outputSchema properties (if defined)
        if config.output_schema:
            mapped = _filter_by_output_schema(mapped, config.output_schema)

        return {"success": True, "data": mapped, "statusCode": resp.status_code}

    async def execute_action(
        self,
        base_url: str,
        api_key: str,
        integration_key: str,
        connection_id: str,
        action_name: str,
        inp: dict[str, Any],
    ) -> dict[str, Any]:
        nango_base = self._base_url(base_url)
        try:
            resp = await self._client.post(
                f"{nango_base}/action/trigger",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Connection-Id": connection_id,
                    "Provider-Config-Key": integration_key,
                },
                json={"action_name": action_name, "input": inp},
            )
            data = resp.json()
            if resp.status_code >= 400:
                error = data.get("error") or data.get("message") or f"Nango action error: {resp.status_code}"
                return {"success": False, "error": str(error), "statusCode": resp.status_code}
            return {"success": True, "data": data, "statusCode": resp.status_code}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def close(self):
        await self._client.aclose()
