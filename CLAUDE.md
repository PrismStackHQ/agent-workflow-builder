# Agent Workflow Platform

An intelligent automation platform that converts natural language commands into scheduled, multi-step agent workflows. Users describe business processes in plain English — e.g., "read my daily emails, find receipts, and upload them to Google Drive" — and the platform orchestrates execution across integrated services.

## Architecture

Eight NestJS microservices communicate via NATS JetStream, backed by PostgreSQL (Prisma ORM) and deployed on Kubernetes with namespace-per-customer isolation.

**Services:** api-gateway (REST entry point), agent-builder (NL parsing via GPT-4o + regex fallback), agent-runtime (step execution with OAuth pause/resume), scheduler-service (K8s CronJob management), websocket-service (real-time event streaming), connection-registry (Nango OAuth), rag-registry (LLM context), onboarding-service (org lifecycle).

**Libraries (libs/):** shared-types, nats-client, prisma-client, auth, observability (OpenTelemetry + pino), integration-provider (proxy action registry + Nango provider).

**Frontend:** Next.js admin dashboard at `frontend/web/`. Example chat app at `examples/chat-app/` demonstrating real-time agentic workflows with OAuth cards and step-by-step feedback.

## Key Patterns

- Events flow through NATS subjects defined in `libs/shared-types/src/events/subjects.ts`
- Proxy actions map integration API calls declaratively via database-driven configs
- Connection metadata (displayName, logoUrl) comes from `AvailableIntegration` records — never hardcode provider names
