import type { TokenResponse } from '@agent-workflow/shared-types';

export interface StepContext {
  orgId: string;
  workspaceId: string;
  agentId: string;
  runId: string;
  endUserConnectionId: string;
  tokens: Map<string, TokenResponse>;
  previousResults: unknown[];
}

export interface IStepAdapter {
  readonly action: string;
  execute(params: Record<string, unknown>, context: StepContext): Promise<unknown>;
}
