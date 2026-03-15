'use server';

import { AgentWorkflowClient } from '@agent-workflow/sdk';

function getClient() {
  return new AgentWorkflowClient({
    apiKey: process.env.AGENT_WORKFLOW_API_KEY || '',
    baseUrl: process.env.AGENT_WORKFLOW_API_URL || 'http://localhost:3001/api/v1',
    endUserId: process.env.END_USER_ID,
  });
}

export async function submitCommand(command: string) {
  const client = getClient();
  return client.agents.submitCommand(command);
}

export async function listAgents() {
  const client = getClient();
  return client.agents.list();
}

export async function getAgent(agentId: string) {
  const client = getClient();
  return client.agents.get(agentId);
}

export async function triggerRun(agentId: string, endUserConnectionId?: string) {
  const client = getClient();
  return client.runs.trigger(agentId, endUserConnectionId ? { endUserConnectionId } : undefined);
}

export async function listRuns(agentId: string) {
  const client = getClient();
  return client.runs.list(agentId);
}

export async function listIntegrations() {
  const client = getClient();
  return client.integrations.list();
}

export async function listTools(providerConfigKey?: string) {
  const client = getClient();
  return client.tools.list(providerConfigKey);
}

export async function checkConnection(providerConfigKey: string, connectionId: string) {
  const client = getClient();
  return client.connections.check(providerConfigKey, connectionId);
}

export async function completeConnection(providerConfigKey: string, connectionId: string, endUserId?: string) {
  const client = getClient();
  return client.connections.complete(providerConfigKey, connectionId, endUserId);
}

export async function getConnectionEndpoint() {
  const client = getClient();
  return client.config.getConnectionEndpoint();
}
