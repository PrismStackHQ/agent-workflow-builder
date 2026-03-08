import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type { AgentStep } from '@agent-workflow/shared-types';
import { ProviderExecutorService } from '@agent-workflow/integration-provider';
import { IStepAdapter, StepContext } from './adapters/adapter.interface';
import { ReceiptFilterAdapter } from './adapters/receipt-filter.adapter';
import { ExpressionEngine } from './expression-engine.service';

@Injectable()
export class RuntimeService {
  private readonly logger = new Logger(RuntimeService.name);
  private readonly localAdapterMap: Map<string, IStepAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
    private readonly providerExecutor: ProviderExecutorService,
    private readonly expressionEngine: ExpressionEngine,
    receiptFilter: ReceiptFilterAdapter,
  ) {
    // Local adapters for compute-only steps (no external API call needed)
    this.localAdapterMap = new Map<string, IStepAdapter>([
      [receiptFilter.action, receiptFilter],
    ]);
  }

  async executeRun(
    agentId: string,
    orgId: string,
    workspaceId?: string,
    endUserConnectionId?: string,
  ): Promise<void> {
    const runId = randomUUID();

    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: agentId } });
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const wsId = workspaceId || agent.workspaceId;
    const connId = endUserConnectionId || '';

    const run = await this.prisma.agentRun.create({
      data: {
        id: runId,
        agentId,
        status: 'RUNNING',
        startedAt: new Date(),
        endUserConnectionId: connId || null,
      },
    });

    await this.nats.publish(SUBJECTS.RUNTIME_RUN_STARTED, {
      orgId,
      workspaceId: wsId,
      agentId,
      runId,
      startedAt: run.startedAt!.toISOString(),
    });

    const steps = agent.steps as unknown as AgentStep[];

    const context: StepContext = {
      orgId,
      workspaceId: wsId,
      agentId,
      runId,
      endUserConnectionId: connId,
      tokens: new Map(),
      previousResults: [],
    };

    await this.executeSteps(runId, orgId, wsId, agent, steps, context, 0);
  }

  async resumeRun(runId: string, connectionId: string): Promise<void> {
    const run = await this.prisma.agentRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error(`Run ${runId} not found`);
    if (run.status !== 'PAUSED') throw new Error(`Run ${runId} is not paused (status: ${run.status})`);

    const agent = await this.prisma.agentDefinition.findUnique({ where: { id: run.agentId } });
    if (!agent) throw new Error(`Agent ${run.agentId} not found`);

    const startIndex = run.pausedAtStepIndex ?? 0;
    const steps = agent.steps as unknown as AgentStep[];

    const now = new Date();
    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'RUNNING',
        resumedAt: now,
        pausedAt: null,
        pausedAtStepIndex: null,
        pauseReason: null,
        pauseMetadata: undefined,
        endUserConnectionId: connectionId || run.endUserConnectionId,
      },
    });

    await this.nats.publish(SUBJECTS.RUNTIME_RUN_RESUMED, {
      orgId: '',
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      runId,
      resumedAt: now.toISOString(),
    });

    const context: StepContext = {
      orgId: '',
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      runId,
      endUserConnectionId: connectionId || run.endUserConnectionId || '',
      tokens: new Map(),
      previousResults: [],
    };

    this.logger.log(`Resuming run ${runId} from step ${startIndex}`);
    await this.executeSteps(runId, context.orgId, agent.workspaceId, agent, steps, context, startIndex);
  }

  private async executeSteps(
    runId: string,
    orgId: string,
    workspaceId: string,
    agent: any,
    steps: AgentStep[],
    context: StepContext,
    startIndex: number,
  ): Promise<void> {
    try {
      for (let i = startIndex; i < steps.length; i++) {
        const step = steps[i];
        this.logger.log(`Executing step ${step.index}: ${step.action} (connector: ${step.connector})`);

        // Check connection before executing provider-backed steps
        if (step.connector && !this.localAdapterMap.has(step.action)) {
          const connCheck = await this.checkStepConnection(step, context);
          if (!connCheck) {
            await this.pauseRun(runId, orgId, workspaceId, agent.id, step, context);
            return; // Exit gracefully — not an error
          }
        }

        // Execute step
        const result = await this.executeStep(step, context);
        this.logger.log(`Run ${runId} Results ${JSON.stringify(result)}`);
        context.previousResults.push(result);

        await this.prisma.agentRun.update({
          where: { id: runId },
          data: { stepsCompleted: i + 1 },
        });

        await this.nats.publish(SUBJECTS.RUNTIME_RUN_STEP_COMPLETED, {
          orgId,
          workspaceId,
          agentId: agent.id,
          runId,
          stepIndex: step.index,
          stepName: step.action,
          stepDescription: step.description,
          result: context.previousResults[context.previousResults.length - 1],
        });
      }

      const endedAt = new Date();
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'SUCCEEDED', endedAt },
      });

      await this.nats.publish(SUBJECTS.RUNTIME_RUN_SUCCEEDED, {
        orgId,
        workspaceId,
        agentId: agent.id,
        runId,
        endedAt: endedAt.toISOString(),
        summary: `Completed ${steps.length} steps successfully`,
      });

      this.logger.log(`Run ${runId} completed successfully`);
    } catch (err) {
      const endedAt = new Date();
      const errorMsg = String(err);

      await this.prisma.agentRun.update({
        where: { id: runId },
        data: { status: 'FAILED', endedAt, errorMessage: errorMsg },
      });

      await this.nats.publish(SUBJECTS.RUNTIME_RUN_FAILED, {
        orgId,
        workspaceId,
        agentId: agent.id,
        runId,
        endedAt: endedAt.toISOString(),
        error: errorMsg,
      });

      this.logger.error(`Run ${runId} failed: ${err}`);
      throw err;
    }
  }

  /**
   * Resolve a ConnectionRef from the database for a given connector name.
   * Uses AvailableIntegration as the source of truth for dynamic provider key
   * resolution — no hardcoded mappings needed.
   */
  private async resolveConnectionRef(
    workspaceId: string,
    connector: string,
    externalRefId: string,
  ): Promise<{ connectionId: string; provider: string } | null> {
    // 1. Exact match on connector name
    const exact = await this.prisma.connectionRef.findFirst({
      where: { workspaceId, provider: connector, externalRefId, status: 'READY' },
      select: { connectionId: true, provider: true },
    });
    if (exact?.connectionId) return { connectionId: exact.connectionId, provider: exact.provider };

    // 2. Use AvailableIntegration to find the actual Nango provider key
    const availableIntegrations = await this.prisma.availableIntegration.findMany({
      where: { workspaceId },
      select: { providerKey: true, displayName: true, rawMetadata: true },
    });

    const connectorLower = connector.toLowerCase();
    const matched = availableIntegrations.find((ai) => {
      const meta = ai.rawMetadata as Record<string, unknown> | null;
      const nangoProvider = ((meta?.provider as string) || '').toLowerCase();
      const displayLower = ai.displayName.toLowerCase().replace(/\s*\(.*\)/, '').replace(/\s+/g, '-');
      const providerKeyLower = ai.providerKey.toLowerCase();
      return (
        providerKeyLower === connectorLower ||
        nangoProvider === connectorLower ||
        displayLower === connectorLower ||
        connectorLower.includes(nangoProvider) ||
        nangoProvider.includes(connectorLower)
      );
    });

    if (matched) {
      this.logger.log(`Resolved connector "${connector}" → Nango provider key "${matched.providerKey}" via AvailableIntegration`);
      const ref = await this.prisma.connectionRef.findFirst({
        where: { workspaceId, provider: matched.providerKey, externalRefId, status: 'READY' },
        select: { connectionId: true, provider: true },
      });
      if (ref?.connectionId) return { connectionId: ref.connectionId, provider: ref.provider };
    }

    this.logger.warn(`No connection resolved for connector="${connector}" in workspace=${workspaceId}`);
    return null;
  }

  private async executeStep(step: AgentStep, context: StepContext): Promise<unknown> {
    // Resolve dynamic expressions in params (e.g. {{step[0].result.id}})
    const resolvedParams = this.expressionEngine.resolve(step.params, context);
    this.logger.log(`Step ${step.index} resolved params: ${JSON.stringify(resolvedParams)}`);

    // Try local adapter first (compute-only steps)
    const localAdapter = this.localAdapterMap.get(step.action);
    if (localAdapter) {
      return localAdapter.execute(resolvedParams, context);
    }

    // Resolve the actual provider connection ID from our ConnectionRef table
    let providerConnectionId = context.endUserConnectionId;
    let resolvedProvider = step.connector;
    if (providerConnectionId && step.connector) {
      const ref = await this.resolveConnectionRef(context.workspaceId, step.connector, providerConnectionId);
      if (ref) {
        providerConnectionId = ref.connectionId;
        resolvedProvider = ref.provider;
      }
    }

    // Execute via integration provider proxy
    const result = await this.providerExecutor.executeViaProvider(
      context.workspaceId,
      resolvedProvider,
      providerConnectionId,
      step.action,
      resolvedParams,
    );

    if (!result.success) {
      throw new Error(`Action ${step.action} failed: ${result.error}`);
    }

    return result.data;
  }

  private async checkStepConnection(step: AgentStep, context: StepContext): Promise<boolean> {
    if (!context.endUserConnectionId) {
      this.logger.warn(`No endUserConnectionId for step ${step.action}, skipping connection check`);
      return false;
    }

    const ref = await this.resolveConnectionRef(context.workspaceId, step.connector, context.endUserConnectionId);

    if (!ref) {
      this.logger.warn(`No READY connection found for ${step.connector} / ${context.endUserConnectionId}`);
      return false;
    }

    try {
      const result = await this.providerExecutor.checkConnection(
        context.workspaceId,
        ref.connectionId,
        ref.provider,
      );
      return result.connected;
    } catch (err) {
      this.logger.error(`Connection check failed for ${step.connector}: ${err}`);
      return false;
    }
  }

  private async pauseRun(
    runId: string,
    orgId: string,
    workspaceId: string,
    agentId: string,
    step: AgentStep,
    context: StepContext,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'PAUSED',
        pausedAt: now,
        pausedAtStepIndex: step.index,
        pauseReason: `connection_required:${step.connector}`,
        pauseMetadata: {
          integrationKey: step.connector,
          connectionId: context.endUserConnectionId,
          actionName: step.action,
        },
      },
    });

    await this.nats.publish(SUBJECTS.RUNTIME_RUN_PAUSED, {
      orgId,
      workspaceId,
      agentId,
      runId,
      pausedAtStepIndex: step.index,
      reason: 'connection_required',
      integrationKey: step.connector,
      actionName: step.action,
      connectionId: context.endUserConnectionId,
      pausedAt: now.toISOString(),
    });

    this.logger.log(`Run ${runId} paused at step ${step.index} — connection required for ${step.connector}`);
  }
}
