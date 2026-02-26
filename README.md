# Agent Workflow Platform

A multi-tenant platform that converts natural-language commands into scheduled, event-driven agent workflows running on Kubernetes.

**Example:** User types *"Create a task to run every day where read emails from my gmail and find the receipts and upload to the gdrive"* and the system parses intent, handles OAuth flows via WebSocket, creates an agent definition, schedules it as a K8s CronJob, and executes it daily.

## Architecture

- **8 NestJS microservices** communicating via NATS JetStream
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
└──────────────┘   └──────────────┘ └────────┘ └───────────┘ └──────────┘
                   ┌──────────────┐ ┌────────┐
                   │  Connection  │ │  RAG   │
                   │  Registry    │ │Registry│
                   └──────────────┘ └────────┘
```

## Prerequisites

- **Node.js** >= 20
- **Docker** & **Docker Compose**
- **Minikube** (for K8s deployment)
- **kubectl**
- **Helm** (optional, for Helm-based deployment)

## Quick Start (Docker Compose)

### 1. Clone and install dependencies

```bash
cd Agent-Workflow-Claude
cp .env.example .env
npm install
```

### 2. Start infrastructure (Postgres + NATS)

```bash
docker compose -f docker-compose.infra.yml up -d
```

### 3. Run database migrations

```bash
cd libs/prisma-client
npx prisma generate
npx prisma migrate dev --name init
cd ../..
```

### 4. Start all services (development mode)

Run each service in a separate terminal:

```bash
# Terminal 1 - API Gateway
cd services/api-gateway && npm run start:dev

# Terminal 2 - Onboarding Service
cd services/onboarding-service && npm run start:dev

# Terminal 3 - Connection Registry
cd services/connection-registry && npm run start:dev

# Terminal 4 - RAG Registry
cd services/rag-registry && npm run start:dev

# Terminal 5 - Agent Builder
cd services/agent-builder && npm run start:dev

# Terminal 6 - Scheduler Service
cd services/scheduler-service && npm run start:dev

# Terminal 7 - Agent Runtime
cd services/agent-runtime && npm run start:dev

# Terminal 8 - WebSocket Service
cd services/websocket-service && npm run start:dev

# Terminal 9 - Frontend
cd frontend/web && npm run dev
```

Or run everything via Docker Compose:

```bash
docker compose up --build
```

### 5. Access the application

| Service         | URL                          |
|-----------------|------------------------------|
| Frontend        | http://localhost:3000         |
| API Gateway     | http://localhost:3001/api/v1  |
| WebSocket       | ws://localhost:3002/ws        |
| NATS Monitoring | http://localhost:8222         |

---

## Running on Minikube

### Step 1: Start Minikube

```bash
minikube start --cpus=4 --memory=8192 --driver=docker
```

> Use at least 4 CPUs and 8GB RAM to run all services comfortably.

### Step 2: Enable required addons

```bash
minikube addons enable ingress
minikube addons enable metrics-server
```

### Step 3: Point Docker to Minikube's daemon

This lets you build images directly inside Minikube without pushing to a registry:

```bash
eval $(minikube docker-env)
```

> **Important:** Run this in every terminal where you build images. Or add it to your shell profile for the session.

### Step 4: Build all Docker images

```bash
# From the project root, with minikube docker-env active
docker build -t agent-workflow/api-gateway:latest -f services/api-gateway/Dockerfile .
docker build -t agent-workflow/onboarding-service:latest -f services/onboarding-service/Dockerfile .
docker build -t agent-workflow/connection-registry:latest -f services/connection-registry/Dockerfile .
docker build -t agent-workflow/rag-registry:latest -f services/rag-registry/Dockerfile .
docker build -t agent-workflow/agent-builder:latest -f services/agent-builder/Dockerfile .
docker build -t agent-workflow/scheduler-service:latest -f services/scheduler-service/Dockerfile .
docker build -t agent-workflow/agent-runtime:latest -f services/agent-runtime/Dockerfile .
docker build -t agent-workflow/websocket-service:latest -f services/websocket-service/Dockerfile .
docker build -t agent-workflow/frontend:latest -f frontend/web/Dockerfile .
```

### Step 5: Deploy with kubectl (Kustomize)

```bash
# Apply all base manifests
kubectl apply -k deploy/k8s/base/

# Wait for pods to be ready
kubectl -n agent-workflow-system get pods -w
```

### Step 6: Run database migrations

```bash
# Get the postgres pod name
POSTGRES_POD=$(kubectl -n agent-workflow-system get pod -l app=postgres -o jsonpath='{.items[0].metadata.name}')

# Port-forward Postgres to local
kubectl -n agent-workflow-system port-forward $POSTGRES_POD 5432:5432 &

# Run migrations from project root
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agent_workflow \
  npx prisma migrate deploy --schema=libs/prisma-client/prisma/schema.prisma
```

### Step 7: Set imagePullPolicy to Never

Since images are built locally in Minikube, update the deployments to not try pulling from a registry:

```bash
# Patch all deployments to use local images
for deploy in api-gateway onboarding-service connection-registry rag-registry agent-builder scheduler-service websocket-service frontend; do
  kubectl -n agent-workflow-system patch deployment $deploy \
    -p '{"spec":{"template":{"spec":{"containers":[{"name":"'$deploy'","imagePullPolicy":"Never"}]}}}}'
done
```

### Step 8: Access the application

**Option A — Minikube tunnel (recommended):**

```bash
minikube tunnel
```

Then add to `/etc/hosts`:

```
127.0.0.1 agent-workflow.local
```

Access at http://agent-workflow.local

**Option B — Port forwarding:**

```bash
# API Gateway
kubectl -n agent-workflow-system port-forward svc/api-gateway 3001:3001 &

# WebSocket
kubectl -n agent-workflow-system port-forward svc/websocket-service 3002:3002 &

# Frontend
kubectl -n agent-workflow-system port-forward svc/frontend 3000:3000 &
```

Access at http://localhost:3000

### Step 9: Verify everything is running

```bash
# Check all pods
kubectl -n agent-workflow-system get pods

# Check services
kubectl -n agent-workflow-system get svc

# Check logs for a specific service
kubectl -n agent-workflow-system logs -l app=api-gateway --tail=50

# Check NATS is healthy
kubectl -n agent-workflow-system logs -l app=nats --tail=20
```

---

## Minikube Helper Script

Save this as `scripts/minikube-deploy.sh` and run it to automate the full deployment:

```bash
#!/bin/bash
set -e

echo "=== Starting Minikube ==="
minikube start --cpus=4 --memory=8192 --driver=docker
minikube addons enable ingress

echo "=== Setting Docker env ==="
eval $(minikube docker-env)

echo "=== Building images ==="
for svc in api-gateway onboarding-service connection-registry rag-registry agent-builder scheduler-service agent-runtime websocket-service; do
  echo "Building $svc..."
  docker build -t agent-workflow/$svc:latest -f services/$svc/Dockerfile .
done
docker build -t agent-workflow/frontend:latest -f frontend/web/Dockerfile .

echo "=== Deploying to Kubernetes ==="
kubectl apply -k deploy/k8s/base/

echo "=== Waiting for pods ==="
kubectl -n agent-workflow-system wait --for=condition=ready pod -l app=postgres --timeout=120s
kubectl -n agent-workflow-system wait --for=condition=ready pod -l app=nats --timeout=120s

echo "=== Running migrations ==="
kubectl -n agent-workflow-system port-forward svc/postgres 5432:5432 &
PF_PID=$!
sleep 3
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agent_workflow \
  npx prisma migrate deploy --schema=libs/prisma-client/prisma/schema.prisma
kill $PF_PID 2>/dev/null

echo "=== Patching imagePullPolicy ==="
for deploy in api-gateway onboarding-service connection-registry rag-registry agent-builder scheduler-service websocket-service frontend; do
  kubectl -n agent-workflow-system patch deployment $deploy \
    -p '{"spec":{"template":{"spec":{"containers":[{"name":"'$deploy'","imagePullPolicy":"Never"}]}}}}' 2>/dev/null || true
done

echo "=== Done! ==="
echo "Run: kubectl -n agent-workflow-system get pods"
echo "Run: minikube tunnel  (then access http://agent-workflow.local)"
echo "Or:  kubectl -n agent-workflow-system port-forward svc/frontend 3000:3000"
```

---

## End-to-End Demo

### 1. Create an organization

```bash
curl -X POST http://localhost:3001/api/v1/orgs \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo Corp", "orgEmail": "admin@demo.com"}'
```

Response: `{"orgId": "xxx", "apiKey": "yyy"}`

### 2. Configure connection endpoint

```bash
curl -X PUT http://localhost:3001/api/v1/config/connection-endpoint \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"connectionEndpointUrl": "https://your-oauth-server.com", "connectionEndpointApiKey": "secret"}'
```

### 3. Add connection references and mark ready

```bash
# Add Gmail connection
curl -X POST http://localhost:3001/api/v1/connections \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"provider": "gmail", "externalRefId": "gmail-ref-001"}'

# Add GDrive connection
curl -X POST http://localhost:3001/api/v1/connections \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"provider": "gdrive", "externalRefId": "gdrive-ref-001"}'

# Mark both as ready (simulating OAuth completion)
curl -X PATCH http://localhost:3001/api/v1/connections/GMAIL_REF_ID/ready \
  -H "X-API-Key: YOUR_API_KEY"

curl -X PATCH http://localhost:3001/api/v1/connections/GDRIVE_REF_ID/ready \
  -H "X-API-Key: YOUR_API_KEY"
```

### 4. Create an agent via natural language

```bash
curl -X POST http://localhost:3001/api/v1/agents/command \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"naturalLanguageCommand": "Create a task to run every day where read emails from my gmail and find the receipts and upload to the gdrive"}'
```

### 5. View agents and runs

```bash
# List agents
curl http://localhost:3001/api/v1/agents -H "X-API-Key: YOUR_API_KEY"

# List runs for an agent
curl http://localhost:3001/api/v1/agents/AGENT_ID/runs -H "X-API-Key: YOUR_API_KEY"
```

---

## Project Structure

```
Agent-Workflow-Claude/
├── libs/                        # Shared libraries
│   ├── shared-types/            # Event payloads, DTOs, enums
│   ├── nats-client/             # NATS JetStream NestJS module
│   ├── prisma-client/           # Prisma schema + service
│   ├── auth/                    # API key guard
│   └── observability/           # OpenTelemetry + pino logger
├── services/                    # Backend microservices
│   ├── api-gateway/             # REST API (port 3001)
│   ├── onboarding-service/      # Org lifecycle
│   ├── connection-registry/     # Connection endpoint management
│   ├── rag-registry/            # RAG endpoint management
│   ├── agent-builder/           # NL parsing + agent creation
│   ├── scheduler-service/       # K8s CronJob management
│   ├── agent-runtime/           # Workflow step execution
│   └── websocket-service/       # Real-time events (port 3002)
├── frontend/web/                # Next.js app (port 3000)
├── deploy/
│   ├── helm/                    # Helm umbrella chart
│   └── k8s/                     # Kustomize manifests
├── docker-compose.yml           # Full stack local dev
└── docker-compose.infra.yml     # Postgres + NATS only
```

## Tech Stack

| Component     | Technology              |
|---------------|-------------------------|
| Frontend      | Next.js 15, Tailwind CSS |
| Backend       | NestJS 10               |
| Event Bus     | NATS JetStream          |
| Database      | PostgreSQL 16 + Prisma  |
| Auth          | API Key (MVP)           |
| Orchestration | Kubernetes              |
| Container     | Docker                  |
