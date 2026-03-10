"""Nango HTTP client and proxy action registry.

Ports:
- libs/integration-provider/src/providers/nango.provider.ts
- libs/integration-provider/src/proxy/proxy-action.registry.ts
- libs/integration-provider/src/proxy/declarative-config-interpreter.ts
- libs/integration-provider/src/proxy/built-in-transformers.ts
"""

import base64
import json
import logging
import re
import time
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


# ── Built-in Transformers ──────────────────────────────────────────────────────


def _extract_query(inp: dict, *keys: str) -> str:
    for k in keys:
        v = inp.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return ""


def _extract_limit(inp: dict, default: int = 10) -> int:
    for k in ("maxResults", "limit", "max", "per_page", "pageSize"):
        v = inp.get(k)
        if v is not None:
            try:
                return int(v)
            except (ValueError, TypeError):
                pass
    return default


# Gmail
def _gmail_search_params(inp: dict) -> dict[str, str]:
    q = _extract_query(inp, "query", "q", "search", "keyword", "keywords", "subject")
    params: dict[str, str] = {}
    if q:
        params["q"] = q
    if inp.get("from"):
        params["q"] = f"{params.get('q', '')} from:{inp['from']}".strip()
    if inp.get("to"):
        params["q"] = f"{params.get('q', '')} to:{inp['to']}".strip()
    params["maxResults"] = str(_extract_limit(inp))
    if inp.get("labelIds"):
        params["labelIds"] = str(inp["labelIds"])
    return params


def _gmail_list_params(inp: dict) -> dict[str, str]:
    return {"maxResults": str(_extract_limit(inp))}


async def _gmail_search_enricher(data: Any, proxy_fetch: Any) -> Any:
    messages = data if isinstance(data, list) else []
    if not messages:
        return messages
    enriched = []
    for msg in messages[:10]:
        try:
            detail = await proxy_fetch(
                "GET",
                f"/gmail/v1/users/me/messages/{msg['id']}",
                {"format": "metadata", "metadataHeaders": "Subject,From,Date"},
            )
            headers = detail.get("payload", {}).get("headers", [])
            get_h = lambda n: next(
                (h["value"] for h in headers if h["name"].lower() == n.lower()), ""
            )
            enriched.append({
                "id": msg["id"],
                "threadId": msg.get("threadId", ""),
                "subject": get_h("Subject"),
                "from": get_h("From"),
                "date": get_h("Date"),
                "snippet": detail.get("snippet", ""),
            })
        except Exception:
            enriched.append({
                "id": msg["id"],
                "threadId": msg.get("threadId", ""),
                "subject": "", "from": "", "date": "", "snippet": "",
            })
    return enriched


def _gmail_full_email_mapper(data: Any) -> Any:
    headers = data.get("payload", {}).get("headers", [])
    get_h = lambda n: next(
        (h["value"] for h in headers if h["name"].lower() == n.lower()), ""
    )
    parts = data.get("payload", {}).get("parts", [])
    return {
        "id": data.get("id"),
        "threadId": data.get("threadId"),
        "subject": get_h("Subject"),
        "from": get_h("From"),
        "to": get_h("To"),
        "date": get_h("Date"),
        "snippet": data.get("snippet", ""),
        "labelIds": data.get("labelIds", []),
        "body": data.get("payload", {}).get("body", {}).get("data", "")
               or (parts[0].get("body", {}).get("data", "") if parts else ""),
        "hasAttachments": any(p.get("filename") for p in parts),
        "attachments": [
            {
                "filename": p["filename"],
                "mimeType": p.get("mimeType"),
                "attachmentId": p.get("body", {}).get("attachmentId"),
                "size": p.get("body", {}).get("size"),
            }
            for p in parts if p.get("filename")
        ],
    }


def _gmail_rfc2822_sender(inp: dict) -> dict[str, Any]:
    if inp.get("raw") and not inp.get("to"):
        return {"raw": inp["raw"]}
    to = str(inp.get("to", ""))
    subject = str(inp.get("subject", "(no subject)"))
    body = str(inp.get("body") or inp.get("text") or inp.get("content") or "")
    cc = f"Cc: {inp['cc']}\r\n" if inp.get("cc") else ""
    message = f"To: {to}\r\n{cc}Subject: {subject}\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\n\r\n{body}"
    raw = base64.urlsafe_b64encode(message.encode()).decode().rstrip("=")
    return {"raw": raw}


# Google Drive
def _drive_search_params(inp: dict) -> dict[str, str]:
    q = _extract_query(inp, "query", "q", "fileName", "name", "search", "keyword", "keywords")
    parts = []
    if q:
        parts.append(f"name contains '{q}'")
    if inp.get("mimeType"):
        parts.append(f"mimeType='{inp['mimeType']}'")
    parts.append("trashed=false")
    return {
        "q": " and ".join(parts),
        "pageSize": str(_extract_limit(inp)),
        "fields": "files(id,name,mimeType,modifiedTime,webViewLink)",
    }


def _drive_create_folder_body(inp: dict) -> dict[str, Any]:
    name = str(inp.get("folderName") or inp.get("name") or "New Folder")
    body: dict[str, Any] = {"name": name, "mimeType": "application/vnd.google-apps.folder"}
    if inp.get("parentId"):
        body["parents"] = [str(inp["parentId"])]
    return body


def _drive_upload_file_body(inp: dict) -> dict[str, Any]:
    name = str(inp.get("fileName") or inp.get("name") or "Untitled")
    body: dict[str, Any] = {"name": name}
    if inp.get("folderId"):
        body["parents"] = [str(inp["folderId"])]
    if inp.get("mimeType"):
        body["mimeType"] = str(inp["mimeType"])
    if inp.get("description") or inp.get("content"):
        desc = str(inp.get("description") or inp.get("content"))
        body["description"] = desc[:797] + "..." if len(desc) > 800 else desc
    return body


# Slack
def _slack_post_message_body(inp: dict) -> dict[str, Any]:
    body: dict[str, Any] = {"channel": inp.get("channel"), "text": inp.get("text")}
    if inp.get("blocks"):
        body["blocks"] = inp["blocks"]
    return body


# Notion
def _notion_search_body(inp: dict) -> dict[str, Any]:
    q = _extract_query(inp, "query", "q", "search", "keyword")
    body: dict[str, Any] = {}
    if q:
        body["query"] = q
    if inp.get("filter"):
        body["filter"] = inp["filter"]
    if inp.get("sort"):
        body["sort"] = inp["sort"]
    body["page_size"] = _extract_limit(inp)
    return body


BUILT_IN_TRANSFORMERS: dict[str, dict[str, Any]] = {
    "gmail_search_params": {"params_builder": _gmail_search_params},
    "gmail_list_params": {"params_builder": _gmail_list_params},
    "gmail_search_enricher": {"post_processor": _gmail_search_enricher},
    "gmail_list_enricher": {"post_processor": _gmail_search_enricher},
    "gmail_full_email_mapper": {"response_mapper": _gmail_full_email_mapper},
    "gmail_rfc2822_sender": {"body_builder": _gmail_rfc2822_sender},
    "drive_search_params": {"params_builder": _drive_search_params},
    "drive_create_folder_body": {"body_builder": _drive_create_folder_body},
    "drive_upload_file_body": {"body_builder": _drive_upload_file_body},
    "slack_post_message_body": {"body_builder": _slack_post_message_body},
    "notion_search_body": {"body_builder": _notion_search_body},
}


# ── DeclarativeConfigInterpreter ──────────────────────────────────────────────


class DeclarativeConfigInterpreter:
    """Converts ProxyActionDefinition DB rows into ProxyActionConfig objects."""

    def interpret(self, row: ProxyActionDefinition) -> ProxyActionConfig:
        overrides: dict[str, Any] = {}
        if row.transformerName:
            for name in row.transformerName.split("+"):
                name = name.strip()
                t = BUILT_IN_TRANSFORMERS.get(name)
                if t:
                    overrides.update(t)
                else:
                    logger.warning(f"Unknown transformer '{name}' for {row.providerConfigKey}::{row.actionName}")

        config = ProxyActionConfig(
            provider_config_key=row.providerConfigKey,
            action_name=row.actionName,
            action_type=row.actionType,
            display_name=row.displayName,
            description=row.description or "",
            method=row.method,
            endpoint=row.endpoint,
            input_schema=row.inputSchema,
            output_schema=row.outputSchema,
        )

        config.params_builder = overrides.get("params_builder") or self._build_params_builder(row.paramsConfig)
        config.body_builder = overrides.get("body_builder") or self._build_body_builder(row.bodyConfig)
        config.headers_builder = overrides.get("headers_builder") or self._build_headers_builder(row.headersConfig)
        config.response_mapper = overrides.get("response_mapper") or self._build_response_mapper(row.responseConfig)
        config.post_processor = overrides.get("post_processor") or self._build_post_processor(row.postProcessConfig)

        return config

    def _build_params_builder(self, cfg: Any) -> ParamsBuilder | None:
        if not cfg:
            return None

        def builder(inp: dict) -> dict[str, str]:
            result: dict[str, str] = {}
            if cfg.get("defaults"):
                result.update(cfg["defaults"])
            for m in cfg.get("mappings", []):
                all_keys = [m["from"]] + m.get("aliases", [])
                val = None
                for k in all_keys:
                    if inp.get(k) is not None:
                        val = str(inp[k])
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
                for k in all_keys:
                    if inp.get(k) is not None:
                        result[m["to"]] = inp[k]
                        break
            return result

        return builder

    def _build_headers_builder(self, cfg: Any) -> HeadersBuilder | None:
        if not cfg or not cfg.get("static"):
            return None
        static = cfg["static"]
        return lambda _: dict(static)

    def _build_response_mapper(self, cfg: Any) -> ResponseMapper | None:
        if not cfg:
            return None

        def mapper(data: Any) -> Any:
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
                    for f in enrich["merge"]:
                        if detail.get(f) is not None:
                            merged[f] = detail[f]
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
