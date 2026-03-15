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

## Node.js SDK

The `@agent-workflow/sdk` package (`packages/sdk/`) provides a typed client for the platform.

### Setup

```typescript
import { AgentWorkflowClient } from '@agent-workflow/sdk';

const client = new AgentWorkflowClient({
  apiKey: 'your-api-key',
  baseUrl: 'http://localhost:3001/api/v1',
  endUserId: 'end-user-123',
});
```

| Parameter    | Required | Description                                        |
|--------------|----------|----------------------------------------------------|
| `apiKey`     | Yes      | Workspace API key (from org creation)               |
| `baseUrl`    | No       | REST API URL (default: `http://localhost:3001/api/v1`) |
| `endUserId`  | No       | Default end-user ID for commands and connections    |

### Create agents

```typescript
// Via natural language
const { commandId } = await client.agents.submitCommand(
  'find invoices from my gmail and upload to gdrive',
);
```

### Manage agents and runs

```typescript
// List all agents
const agents = await client.agents.list();

// Get a specific agent
const agent = await client.agents.get('agent-id');

// Trigger a run
const { runId } = await client.runs.trigger('agent-id');

// List runs for an agent
const runs = await client.runs.list('agent-id');

// Resume a paused run (after OAuth)
await client.runs.resume('agent-id', 'run-id', 'connection-id');
```

### Connections

```typescript
// Register an end-user connection (after OAuth)
await client.connections.complete(
  'google-mail',       // providerConfigKey
  'nango-conn-abc',    // connectionId
);

// Check connection status
const status = await client.connections.check('google-mail', 'conn-id');
```

### Real-time WebSocket events

```typescript
// Connect to the WebSocket server
await client.connect();

// Agent lifecycle events
client.on('agent:created', (e) => {
  console.log('Agent created:', e.name, e.agentId);
});

client.on('agent:scheduled', (e) => {
  console.log('Agent scheduled:', e.cronJobName, e.nextRunAt);
});

// Run lifecycle events
client.on('run:started', (e) => {
  console.log('Run started:', e.runId);
});

client.on('run:step_completed', (e) => {
  console.log(`Step ${e.stepIndex} completed:`, e.stepName);
});

client.on('run:paused', (e) => {
  console.log('Run paused — needs OAuth for:', e.providerConfigKey);
  // Show OAuth card to user, then resume:
  // await client.runs.resume(e.agentId, e.runId, connectionId);
});

client.on('run:resumed', (e) => {
  console.log('Run resumed:', e.runId);
});

client.on('run:succeeded', (e) => {
  console.log('Run completed:', e.summary);
});

client.on('run:failed', (e) => {
  console.error('Run failed:', e.error);
});

// Unsubscribe from a specific event
client.off('run:started', handler);

// Disconnect when done
client.disconnect();
```

### Available WebSocket events

| Event                | Payload fields                                          |
|----------------------|---------------------------------------------------------|
| `agent:created`      | `agentId`, `name`, `scheduleCron`, `status`             |
| `agent:scheduled`    | `agentId`, `cronJobName`, `nextRunAt`                   |
| `run:started`        | `agentId`, `runId`, `startedAt`                         |
| `run:step_completed` | `agentId`, `runId`, `stepIndex`, `stepName`             |
| `run:paused`         | `agentId`, `runId`, `reason`, `providerConfigKey`, `actionName`, `pausedAt` |
| `run:resumed`        | `agentId`, `runId`, `resumedAt`                         |
| `run:succeeded`      | `agentId`, `runId`, `summary`                           |
| `run:failed`         | `agentId`, `runId`, `error`                             |

### Build the SDK

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
OPENAI_API_KEY=openai_api_key
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

---

## TODO

- [ ] Support other integration providers (beyond Nango)
- [ ] Enable scheduler service
- [ ] Kubernetes support
- [ ] Enrich `templates/proxy-actions/` with more integration templates
- [ ] Usage documentation
- [ ] Support Bring Your Own LLM
- [ ] Support Bring Your Own RAG

---

This was built with help from [Claude Code](https://claude.ai/claude-code).
