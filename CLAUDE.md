# Agent Workflow Platform

An intelligent automation platform that converts natural language commands into scheduled, multi-step agent workflows. Users describe business processes in plain English — e.g., "read my daily emails, find receipts, and upload them to Google Drive" — and the platform orchestrates execution across integrated services.

## Architecture

NestJS microservices (TypeScript) and Python services communicate via NATS JetStream, backed by PostgreSQL (Prisma ORM) and deployed via Docker Compose (Kubernetes-ready with namespace-per-customer isolation).

**TypeScript Services:** api-gateway (REST entry point), websocket-service (real-time event streaming), connection-registry (Nango OAuth), scheduler-service (K8s CronJob management), onboarding-service (org lifecycle).

**Python Services:** agent-builder-py (LLM planner via Claude/GPT + LangGraph), agent-runtime-py (step execution with OAuth pause/resume).

**Libraries (libs/):** shared-types, nats-client, prisma-client, auth, observability (OpenTelemetry + pino), integration-provider (proxy action registry + declarative config interpreter + template loader).

**Shared Python (services/shared-py/):** SQLAlchemy models, NATS event helpers, Nango client with declarative config interpreter.

**Frontend:** Next.js admin dashboard at `frontend/web/`. Example chat app at `examples/chat-app/` demonstrating real-time agentic workflows with OAuth cards and step-by-step feedback.

## Key Patterns

- Events flow through NATS subjects defined in `libs/shared-types/src/events/subjects.ts`
- Proxy actions map integration API calls **fully declaratively** via database-driven configs — no hardcoded transformer functions
- Connection metadata (displayName, logoUrl) comes from `AvailableIntegration` records — never hardcode provider names
- **`providerConfigKey`** is the standardized field name across the entire platform for identifying integration provider configurations (e.g., `google-drive-4`, `google-mail`). All models use this name: `AvailableIntegration.providerConfigKey`, `ConnectionRef.providerConfigKey`, `ToolRegistryEntry.providerConfigKey`, `ProxyActionDefinition.providerConfigKey`

## Proxy Action Declarative Config System

All third-party API interactions are configured declaratively through `ProxyActionDefinition` rows in the database. **No transformer functions or hardcoded API attribute names** — everything is driven by JSON config.

### Config Fields

- **`inputSchema`** — JSON Schema defining accepted input parameters. Extended properties (`mapTo`, `aliases`, `default`, `wrapArray`) auto-generate param/body mappings. Fields referenced by `queryBuilder.when` or `bodyConfig.template` are auto-enriched into the schema so the LLM planner discovers them.
- **`outputSchema`** — JSON Schema defining the output format. Acts as a **filter**: only fields listed in `outputSchema.properties` are returned. Also drives `fieldsParam` to request only needed fields from the API.
- **`paramsConfig`** — Query parameter configuration:
  - `defaults`: static params always sent
  - `mappings`: auto-generated from `inputSchema` extended fields
  - `queryBuilder`: builds composite query strings (e.g., `q=name contains 'X' and trashed=false`)
  - `fieldsParam`: auto-derives API field selection from `outputSchema` (e.g., `fields=files(id,name,mimeType)`)
- **`bodyConfig`** — Request body configuration:
  - `defaults`, `template`, `mappings` (with `wrapArray` support)
  - `mimeEncode: true` — builds RFC2822 MIME messages for email sending
- **`headersConfig`** — Static HTTP headers (e.g., `Notion-Version`)
- **`responseConfig`** — Response mapping:
  - `rootPath`: extract from nested response (e.g., `"files"`, `"messages"`)
  - `pick`, `flatten`: standard list filtering
  - `extractHeaders`: extract from key-value arrays (e.g., Gmail's `payload.headers`)
  - `mergeFields`: copy top-level fields
  - `bodyExtract`: extract body from nested MIME parts with fallback
  - `attachmentExtract`: extract attachment metadata from parts
- **`postProcessConfig`** — Post-processing with enrichment:
  - `enrichment.endpoint`: fetch additional data per item (with `{{field}}` substitution)
  - `enrichment.merge`: fields to copy from enrichment response
  - `enrichment.extractHeaders`: extract from key-value arrays in enrichment response

### Template System

Proxy action templates live as JSON files in `templates/proxy-actions/` (one file per integration type, e.g., `google-drive.json`, `slack.json`). Templates are **not** auto-imported during tool sync. Instead, admins explicitly import templates via the "Import Proxy Tools" flow on the Tools page, which:

1. Shows available templates from the JSON files
2. Lets the admin review all actions before importing
3. Requires selecting an `AvailableIntegration` to assign the `providerConfigKey`
4. Creates `ProxyActionDefinition` rows on approval

The `TemplateLoaderService` (`libs/integration-provider/src/proxy/template-loader.service.ts`) reads template files at runtime. Template directory is configurable via `TEMPLATE_DIR` env var (defaults to `templates/proxy-actions/` relative to `process.cwd()`).

### Interpreters

Two parallel interpreters convert DB rows into executable configs:
- **TypeScript**: `libs/integration-provider/src/proxy/declarative-config-interpreter.ts` (used by api-gateway)
- **Python**: `services/shared-py/shared/nango_client.py` (used by agent-runtime-py, agent-builder-py)

Both must be kept in sync when adding new declarative config features.

### Important Rules

- **Never hardcode API attribute names** (e.g., `threadId`, `subject`, `snippet`). All field mapping is declarative via `extractHeaders`, `mergeFields`, `bodyExtract`, `attachmentExtract`.
- **No transformer functions** — the `transformerName` DB column exists but is unused. All logic is expressed through declarative config.
- **`outputSchema` filters results** — editing `outputSchema` to remove a field means that field is no longer returned.
- **`inputSchema` is the single source of truth** for parameter definitions. Use `mapTo`, `aliases`, `default`, `wrapArray` in schema properties instead of separate `paramsConfig.mappings` or `bodyConfig.mappings`.
- **Do not auto-deploy** — provide the build/deploy command for the user to run manually.

## Build & Deploy

```bash
docker compose build <services> && docker compose up -d
```

Services to rebuild depend on what changed:
- `shared-py` + `agent-runtime` + `agent-builder` — Python services or shared-py changes
- `api-gateway` — TypeScript interpreter, proxy-actions service, or integration-provider lib changes
- `frontend` — UI changes
- `websocket-service` — WebSocket handler changes
- Prisma migrations run from `libs/prisma-client` directory
- `npm install` from root for monorepo deps
