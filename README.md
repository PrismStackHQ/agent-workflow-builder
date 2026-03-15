# Agent Workflow Platform

An intelligent automation platform that converts natural language commands into scheduled, multi-step agent workflows. Users describe business processes in plain English — e.g., "read my daily emails, find receipts, and upload them to Google Drive" — and the platform orchestrates execution across integrated services.

## Architecture

- **NestJS microservices** (TypeScript) + **Python services** (FastAPI/LangGraph) communicating via NATS JetStream
- **Next.js frontend** with real-time WebSocket updates
- **PostgreSQL** (Prisma ORM) for persistence
- **Kubernetes** namespace-per-customer isolation with CronJob scheduling

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Frontend   │────▶│  API Gateway │────▶│  NATS JetStream   │
│  (Next.js)   │     │  (REST BFF)  │     │  (Event Bus)      │
└──────┬───────┘     └──────────────┘     └────────┬──────────┘
       │                                           │
       │ WebSocket                    ┌────────────┼────────────────┐
       ▼                              ▼            ▼                ▼
┌──────────────┐   ┌──────────────┐ ┌────────┐ ┌───────────┐ ┌──────────┐
│  WebSocket   │   │  Onboarding  │ │ Agent  │ │ Scheduler │ │  Agent   │
│  Service     │   │  Service     │ │Builder │ │ Service   │ │ Runtime  │
└──────────────┘   └──────────────┘ │  (Py)  │ └───────────┘ │   (Py)   │
                                    └────────┘               └──────────┘
```

## Prerequisites

- **Node.js** >= 20
- **Python** >= 3.11
- **Docker** & **Docker Compose**
- **Minikube** (for K8s deployment)
- **kubectl**

## Quick Start (Docker Compose)

### 1. Clone and install dependencies

```bash
cd agent-workflow-builder
cp .env.example .env
npm install
```

### 2. Start everything via Docker Compose

```bash
docker compose up --build
```

### 3. Run database migrations

```bash
cd libs/prisma-client
npx prisma generate
npx prisma migrate deploy
cd ../..
```

### 4. Access the application

| Service         | URL                          |
|-----------------|------------------------------|
| Frontend        | http://localhost:3000         |
| API Gateway     | http://localhost:3001/api/v1  |
| WebSocket       | ws://localhost:3002/ws        |
| NATS Monitoring | http://localhost:8222         |

---

## End-to-End Demo

### 1. Create an organization

```bash
curl -X POST http://localhost:3001/api/v1/orgs \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo Corp", "orgEmail": "admin@demo.com"}'
```

Response: `{"orgId": "xxx", "apiKey": "yyy"}`

### 2. Configure integration provider

```bash
curl -X PUT http://localhost:3001/api/v1/config/connection-endpoint \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "integrationProvider": "NANGO",
    "connectionEndpointUrl": "https://api.nango.dev",
    "connectionEndpointApiKey": "your-nango-secret-key"
  }'
```

### 3. Register end-user connections (after OAuth)

```bash
# Register Gmail connection for end user
curl -X POST http://localhost:3001/api/v1/connections/complete \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "providerConfigKey": "google-mail",
    "connectionId": "nango-conn-gmail-001",
    "endUserId": "user-123",
    "metadata": {"connectedAt": "2025-01-01"}
  }'
```

### 4. Create an agent via natural language

```bash
curl -X POST http://localhost:3001/api/v1/agents/command \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "naturalLanguageCommand": "Find emails with invoices from my gmail and upload them to gdrive",
    "endUserId": "user-123"
  }'
```

### 5. View agents and runs

```bash
# List agents
curl http://localhost:3001/api/v1/agents -H "X-API-Key: YOUR_API_KEY"

# List runs for an agent
curl http://localhost:3001/api/v1/agents/AGENT_ID/runs -H "X-API-Key: YOUR_API_KEY"
```

---

## Node.js SDK

The `@agent-workflow/sdk` package (`packages/sdk/`) provides a typed client for the platform.

```typescript
import { AgentWorkflowClient } from '@agent-workflow/sdk';

const client = new AgentWorkflowClient({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3001/api/v1',
  wsUrl: 'ws://localhost:3002/ws',
});

// Create an agent via natural language
const { commandId } = await client.agents.submitCommand(
  'find invoices from my gmail and upload to gdrive',
  'end-user-123',
);

// Or create an agent with explicit steps
const agent = await client.agents.create({
  name: 'Invoice Processor',
  triggerType: 'cron',
  scheduleCron: '0 8 * * *',
  steps: [
    { index: 0, action: 'EMAILS-LIST', connector: 'google-mail', params: { query: 'invoice' } },
    { index: 1, action: 'UPLOAD-FILE', connector: 'google-drive', params: {} },
  ],
});

// Register an end-user connection (after OAuth)
await client.connections.complete(
  'google-mail',       // providerConfigKey
  'nango-conn-abc',    // connectionId
  'end-user-123',      // endUserId
  { source: 'onboarding' },
);

// Real-time events
await client.connect();
client.on('agent:created', (e) => console.log('Agent created:', e.name));
client.on('run:started', (e) => console.log('Run started:', e.runId));
client.on('run:paused', (e) => console.log('Run paused, needs:', e.providerConfigKey));
client.on('run:succeeded', (e) => console.log('Done:', e.summary));
```

Build the SDK:

```bash
cd packages/sdk && npx tsc
```

---

## Example: Chat App

A standalone Next.js chat application (`examples/chat-app/`) that demonstrates the full agentic workflow with a real-time chat UI.

Features:
- Real-time WebSocket events (agent creation, step progress, pauses, completions)
- OAuth connection cards with connect/resume flow
- Tool execution results with syntax-highlighted JSON
- Animated thinking indicators and step progress
- Chat history sidebar with connection status

### Running the Chat App

**Prerequisites:** The platform services must be running (via Docker Compose or individually).

```bash
# 1. Navigate to the chat app
cd examples/chat-app

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.local.example .env.local
# Edit .env.local and set your workspace API key:
#   AGENT_WORKFLOW_API_KEY=your-workspace-api-key
#   NEXT_PUBLIC_API_KEY=your-workspace-api-key

# 4. Build the SDK (required — the chat app depends on it)
cd ../../packages/sdk && npx tsc && cd ../../examples/chat-app

# 5. Start the dev server
npm run dev
```

The chat app runs on **http://localhost:3100**.

| Variable | Description |
|----------|-------------|
| `AGENT_WORKFLOW_API_KEY` | Workspace API key (server-side SDK calls) |
| `AGENT_WORKFLOW_API_URL` | Platform API URL (default: `http://localhost:3001/api/v1`) |
| `AGENT_WORKFLOW_WS_URL` | Platform WebSocket URL (default: `ws://localhost:3002/ws`) |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL for browser (default: `ws://localhost:3002/ws`) |
| `NEXT_PUBLIC_API_KEY` | API key for browser WebSocket auth |

---

## LLM-Powered Agent Planner

The agent-builder service uses Claude (via LangGraph) to parse natural language commands into structured execution plans. The planner dynamically discovers available integrations and actions from the tool registry.

**How it works:**

1. User submits a natural language command
2. LLM calls `list_integrations` to discover available connectors
3. LLM calls `search_tools` to find actions for each relevant connector
4. LLM calls `check_connection` to verify the end user's connections
5. LLM calls `submit_plan` with a structured execution plan
6. Plan is validated against the tool registry and passed to the runtime

Set the key in `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

---

## Project Structure

```
agent-workflow-builder/
├── libs/                        # Shared TypeScript libraries
│   ├── shared-types/            # Event payloads, DTOs, enums
│   ├── nats-client/             # NATS JetStream NestJS module
│   ├── prisma-client/           # Prisma schema + service
│   ├── integration-provider/    # Proxy action registry + declarative config
│   ├── auth/                    # API key guard
│   └── observability/           # OpenTelemetry + pino logger
├── packages/
│   └── sdk/                     # Node.js SDK (@agent-workflow/sdk)
├── services/                    # Backend microservices
│   ├── api-gateway/             # REST API (NestJS, port 3001)
│   ├── onboarding-service/      # Org lifecycle (NestJS)
│   ├── agent-builder-py/        # LLM planner + agent creation (Python/LangGraph)
│   ├── agent-runtime-py/        # Workflow step execution (Python)
│   ├── scheduler-service/       # K8s CronJob management (NestJS)
│   ├── websocket-service/       # Real-time events (NestJS, port 3002)
│   └── shared-py/               # Shared Python library (models, NATS, Nango client)
├── templates/
│   └── proxy-actions/           # JSON proxy action template files
├── frontend/web/                # Next.js admin app (port 3000)
├── examples/
│   └── chat-app/                # Agentic chat UI example (port 3100)
├── deploy/
│   ├── helm/                    # Helm umbrella chart
│   └── k8s/                     # Kustomize manifests
├── docker-compose.yml           # Full stack local dev
└── docker-compose.infra.yml     # Postgres + NATS only
```

## Tech Stack

| Component     | Technology                        |
|---------------|-----------------------------------|
| Frontend      | Next.js 15, Tailwind CSS          |
| Backend (TS)  | NestJS 10                         |
| Backend (Py)  | FastAPI, LangGraph                |
| LLM Planner   | Claude (Anthropic)                |
| Event Bus     | NATS JetStream                    |
| Database      | PostgreSQL 16 + Prisma            |
| Auth          | API Key + Firebase (frontend)     |
| SDK           | TypeScript (Node.js)              |
| Orchestration | Kubernetes                        |
| Container     | Docker                            |
