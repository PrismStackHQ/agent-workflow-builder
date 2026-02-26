#!/bin/bash
set -e

echo "=== Agent Workflow Platform - Minikube Deployment ==="
echo ""

# Check prerequisites
command -v minikube >/dev/null 2>&1 || { echo "minikube is required but not installed."; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required but not installed."; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker is required but not installed."; exit 1; }

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# Step 1: Start Minikube
echo "=== Step 1: Starting Minikube ==="
if minikube status | grep -q "Running"; then
  echo "Minikube is already running"
else
  minikube start --cpus=4 --memory=8192 --driver=docker
fi
minikube addons enable ingress

# Step 2: Set Docker env to Minikube
echo ""
echo "=== Step 2: Setting Docker environment ==="
eval $(minikube docker-env)

# Step 3: Build all images
echo ""
echo "=== Step 3: Building Docker images ==="
SERVICES=(api-gateway onboarding-service connection-registry rag-registry agent-builder scheduler-service agent-runtime websocket-service)

for svc in "${SERVICES[@]}"; do
  echo "  Building agent-workflow/$svc..."
  docker build -q -t "agent-workflow/$svc:latest" -f "services/$svc/Dockerfile" .
done

echo "  Building agent-workflow/frontend..."
docker build -q -t "agent-workflow/frontend:latest" -f "frontend/web/Dockerfile" .

echo "  All images built successfully"

# Step 4: Deploy to Kubernetes
echo ""
echo "=== Step 4: Deploying to Kubernetes ==="
kubectl apply -k deploy/k8s/base/

# Step 5: Wait for infra pods
echo ""
echo "=== Step 5: Waiting for infrastructure pods ==="
echo "  Waiting for Postgres..."
kubectl -n agent-workflow-system wait --for=condition=ready pod -l app=postgres --timeout=180s 2>/dev/null || true
echo "  Waiting for NATS..."
kubectl -n agent-workflow-system wait --for=condition=ready pod -l app=nats --timeout=180s 2>/dev/null || true

# Step 6: Run database migrations
echo ""
echo "=== Step 6: Running database migrations ==="
kubectl -n agent-workflow-system port-forward svc/postgres 5432:5432 &
PF_PID=$!
sleep 5

if [ -f "libs/prisma-client/prisma/schema.prisma" ]; then
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agent_workflow \
    npx prisma migrate dev --name init --schema=libs/prisma-client/prisma/schema.prisma 2>/dev/null || \
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agent_workflow \
    npx prisma db push --schema=libs/prisma-client/prisma/schema.prisma
fi

kill $PF_PID 2>/dev/null || true
wait $PF_PID 2>/dev/null || true

# Step 7: Patch imagePullPolicy
echo ""
echo "=== Step 7: Patching imagePullPolicy to Never ==="
DEPLOYMENTS=(api-gateway onboarding-service connection-registry rag-registry agent-builder scheduler-service websocket-service frontend)
for deploy in "${DEPLOYMENTS[@]}"; do
  kubectl -n agent-workflow-system patch deployment "$deploy" \
    -p "{\"spec\":{\"template\":{\"spec\":{\"containers\":[{\"name\":\"$deploy\",\"imagePullPolicy\":\"Never\"}]}}}}" 2>/dev/null || true
done

# Step 8: Wait for all pods
echo ""
echo "=== Step 8: Waiting for all pods ==="
sleep 5
kubectl -n agent-workflow-system get pods

echo ""
echo "=========================================="
echo "  Deployment complete!"
echo "=========================================="
echo ""
echo "To access the application:"
echo ""
echo "  Option A (Ingress):"
echo "    1. Run: minikube tunnel"
echo "    2. Add to /etc/hosts: 127.0.0.1 agent-workflow.local"
echo "    3. Open: http://agent-workflow.local"
echo ""
echo "  Option B (Port forwarding):"
echo "    kubectl -n agent-workflow-system port-forward svc/frontend 3000:3000 &"
echo "    kubectl -n agent-workflow-system port-forward svc/api-gateway 3001:3001 &"
echo "    kubectl -n agent-workflow-system port-forward svc/websocket-service 3002:3002 &"
echo "    Open: http://localhost:3000"
echo ""
echo "To check status:"
echo "  kubectl -n agent-workflow-system get pods"
echo "  kubectl -n agent-workflow-system logs -l app=api-gateway --tail=50"
echo ""
echo "To stop:"
echo "  kubectl delete -k deploy/k8s/base/"
echo "  minikube stop"
