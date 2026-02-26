import type { TokenResponse } from '@agent-workflow/shared-types';

export interface StepContext {
  orgId: string;
  agentId: string;
  runId: string;
  tokens: Map<string, TokenResponse>;
  previousResults: unknown[];
}

export interface IStepAdapter {
  readonly action: string;
  execute(params: Record<string, unknown>, context: StepContext): Promise<unknown>;
}
