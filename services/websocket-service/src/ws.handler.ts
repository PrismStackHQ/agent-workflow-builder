import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import type {
  ConnectionOAuthRequiredEvent,
  AgentPlanPreviewEvent,
  AgentDefinitionCreatedEvent,
  AgentScheduledEvent,
  AgentRunStartedEvent,
  AgentRunStepCompletedEvent,
  AgentRunSucceededEvent,
  AgentRunFailedEvent,
  AgentRunPausedEvent,
  AgentRunResumedEvent,
  AgentRunSubAgentStartedEvent,
  AgentRunIterationProgressEvent,
  AgentRunThinkingEvent,
  OrgCreatedEvent,
  ConnectionEndpointConfiguredEvent,
  RagConfiguredEvent,
} from '@agent-workflow/shared-types';
import { WsService } from './ws.service';

@Injectable()
export class WsHandler implements OnModuleInit {
  private readonly logger = new Logger(WsHandler.name);

  constructor(
    private readonly nats: NatsService,
    private readonly wsService: WsService,
  ) {}

  async onModuleInit() {
    await this.nats.subscribe<ConnectionOAuthRequiredEvent>(
      SUBJECTS.CONNECTION_OAUTH_REQUIRED,
      'ws-connection-oauth-required',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'wait_connection_oauth',
          payload: {
            agentDraftId: data.agentDraftId,
            provider: data.provider,
            connectionRefId: data.connectionRefId,
            endUserId: data.endUserId,
          },
        });
      },
    );

    await this.nats.subscribe<AgentPlanPreviewEvent>(
      SUBJECTS.AGENT_PLAN_PREVIEW,
      'ws-agent-plan-preview',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_plan_preview',
          payload: {
            commandId: data.commandId,
            name: data.name,
            naturalLanguageCommand: data.naturalLanguageCommand,
            triggerType: data.triggerType,
            schedule: data.schedule,
            connectors: data.connectors,
            steps: data.steps,
            missingConnections: data.missingConnections,
            connectorDisplayNames: data.connectorDisplayNames,
            instructions: data.instructions,
            endUserId: data.endUserId,
          },
        });
      },
    );

    await this.nats.subscribe<AgentDefinitionCreatedEvent>(
      SUBJECTS.AGENT_DEFINITION_CREATED,
      'ws-agent-definition-created',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_created',
          payload: {
            agentId: data.agentId,
            name: data.name,
            scheduleCron: data.scheduleCron,
            status: data.status,
          },
        });
      },
    );

    await this.nats.subscribe<AgentScheduledEvent>(
      SUBJECTS.SCHEDULER_AGENT_SCHEDULED,
      'ws-agent-scheduled',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_scheduled',
          payload: {
            agentId: data.agentId,
            cronJobName: data.cronJobName,
            nextRunAt: data.nextRunAt,
          },
        });
      },
    );

    await this.nats.subscribe<AgentRunStartedEvent>(
      SUBJECTS.RUNTIME_RUN_STARTED,
      'ws-run-started',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_started',
          payload: { agentId: data.agentId, runId: data.runId, startedAt: data.startedAt },
        });
      },
    );

    await this.nats.subscribe<AgentRunStepCompletedEvent>(
      SUBJECTS.RUNTIME_RUN_STEP_COMPLETED,
      'ws-run-step-completed',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_step_completed',
          payload: {
            agentId: data.agentId,
            runId: data.runId,
            stepIndex: data.stepIndex,
            stepName: data.stepName,
            stepDescription: data.stepDescription,
            status: data.status,
            icon: data.icon,
            inputSummary: data.inputSummary,
            outputSummary: data.outputSummary,
            arguments: data.arguments,
            result: data.result,
          },
        });
      },
    );

    await this.nats.subscribe<AgentRunSucceededEvent>(
      SUBJECTS.RUNTIME_RUN_SUCCEEDED,
      'ws-run-succeeded',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_succeeded',
          payload: { agentId: data.agentId, runId: data.runId, summary: data.summary },
        });
      },
    );

    await this.nats.subscribe<AgentRunFailedEvent>(
      SUBJECTS.RUNTIME_RUN_FAILED,
      'ws-run-failed',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_failed',
          payload: { agentId: data.agentId, runId: data.runId, error: data.error },
        });
      },
    );

    await this.nats.subscribe<AgentRunPausedEvent>(
      SUBJECTS.RUNTIME_RUN_PAUSED,
      'ws-run-paused',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_paused',
          payload: {
            agentId: data.agentId,
            runId: data.runId,
            reason: data.reason,
            integrationKey: data.integrationKey,
            actionName: data.actionName,
            pausedAt: data.pausedAt,
          },
        });
      },
    );

    await this.nats.subscribe<AgentRunResumedEvent>(
      SUBJECTS.RUNTIME_RUN_RESUMED,
      'ws-run-resumed',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_resumed',
          payload: {
            agentId: data.agentId,
            runId: data.runId,
            resumedAt: data.resumedAt,
          },
        });
      },
    );

    await this.nats.subscribe<AgentRunSubAgentStartedEvent>(
      SUBJECTS.RUNTIME_RUN_SUB_AGENT_STARTED,
      'ws-run-sub-agent-started',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_sub_agent_started',
          payload: {
            agentId: data.agentId,
            runId: data.runId,
            stepIndex: data.stepIndex,
            childAgentId: data.childAgentId,
            childRunId: data.childRunId,
            childAgentName: data.childAgentName,
            depth: data.depth,
          },
        });
      },
    );

    await this.nats.subscribe<AgentRunIterationProgressEvent>(
      SUBJECTS.RUNTIME_RUN_ITERATION_PROGRESS,
      'ws-run-iteration-progress',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_iteration_progress',
          payload: {
            agentId: data.agentId,
            runId: data.runId,
            stepIndex: data.stepIndex,
            iterationIndex: data.iterationIndex,
            totalItems: data.totalItems,
            status: data.status,
            itemLabel: data.itemLabel,
          },
        });
      },
    );

    await this.nats.subscribe<AgentRunThinkingEvent>(
      SUBJECTS.RUNTIME_RUN_THINKING,
      'ws-run-thinking',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_run_thinking',
          payload: {
            agentId: data.agentId,
            runId: data.runId,
            text: data.text,
          },
        });
      },
    );

    await this.nats.subscribe<{
      orgId: string;
      workspaceId: string;
      commandId: string;
      stepType: string;
      label: string;
      icon?: string;
      outputSummary?: string;
      displayName?: string;
      logoUrl?: string;
    }>(
      SUBJECTS.AGENT_PLANNER_PROGRESS,
      'ws-planner-progress',
      async (data) => {
        this.wsService.sendToWorkspace(data.workspaceId, {
          type: 'agent_planner_progress',
          payload: {
            commandId: data.commandId,
            stepType: data.stepType,
            label: data.label,
            icon: data.icon,
            outputSummary: data.outputSummary,
            displayName: data.displayName,
            logoUrl: data.logoUrl,
          },
        });
      },
    );

    this.logger.log('WebSocket NATS event handlers initialized');
  }
}
