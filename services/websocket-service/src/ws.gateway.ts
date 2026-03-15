import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { WebSocket } from 'ws';
import { PrismaService } from '@agent-workflow/prisma-client';
import { NatsService } from '@agent-workflow/nats-client';
import { SUBJECTS } from '@agent-workflow/shared-types';
import { WsService } from './ws.service';

interface AuthenticatedSocket extends WebSocket {
  orgId?: string;
  workspaceId?: string;
  orgName?: string;
}

@WebSocketGateway({ path: '/ws' })
export class WsGatewayService implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WsGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
    private readonly wsService: WsService,
  ) {}

  handleConnection(client: AuthenticatedSocket) {
    this.logger.log('New WebSocket connection');
    client.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        await this.handleMessage(client, msg);
      } catch (err) {
        this.logger.error(`Error handling WS message: ${err}`);
      }
    });
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.workspaceId) {
      this.wsService.unregister(client.workspaceId, client);
      this.logger.log(`Socket disconnected for workspace ${client.workspaceId}`);
    }
  }

  private async handleMessage(client: AuthenticatedSocket, msg: { type: string; payload?: any }) {
    switch (msg.type) {
      case 'auth':
        await this.handleAuth(client, msg.payload);
        break;
      case 'agent_command_submit':
        await this.handleAgentCommand(client, msg.payload);
        break;
      case 'oauth_complete':
        await this.handleOAuthComplete(client, msg.payload);
        break;
      case 'connection_completed':
        await this.handleConnectionCompleted(client, msg.payload);
        break;
      case 'agent_plan_confirm':
        await this.handlePlanConfirm(client, msg.payload);
        break;
      case 'ping':
        this.send(client, { type: 'pong' });
        break;
      default:
        this.logger.warn(`Unknown message type: ${msg.type}`);
    }
  }

  private async handleAuth(client: AuthenticatedSocket, payload: { apiKey: string }) {
    if (!payload?.apiKey) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Missing API key' } });
      return;
    }

    const workspace = await this.prisma.workspace.findFirst({
      where: { apiKey: payload.apiKey, deletedAt: null },
      include: { organization: true },
    });

    if (!workspace) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Invalid API key' } });
      return;
    }

    client.orgId = workspace.orgId;
    client.workspaceId = workspace.id;
    client.orgName = workspace.organization.name;
    this.wsService.register(workspace.id, client);

    this.send(client, {
      type: 'auth_success',
      payload: { orgId: workspace.orgId, workspaceId: workspace.id, orgName: workspace.organization.name },
    });
  }

  private async handleAgentCommand(client: AuthenticatedSocket, payload: { naturalLanguageCommand: string; endUserId?: string }) {
    if (!client.workspaceId) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Not authenticated' } });
      return;
    }

    const { randomUUID } = await import('crypto');
    const commandId = randomUUID();

    await this.nats.publish(SUBJECTS.AGENT_COMMAND_SUBMITTED, {
      orgId: client.orgId,
      workspaceId: client.workspaceId,
      commandId,
      naturalLanguageCommand: payload.naturalLanguageCommand,
      endUserId: payload.endUserId,
    });

    this.send(client, {
      type: 'command_accepted',
      payload: { commandId, status: 'processing' },
    });
  }

  private async handleOAuthComplete(client: AuthenticatedSocket, payload: { connectionRefId: string; provider: string }) {
    if (!client.workspaceId) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Not authenticated' } });
      return;
    }

    await this.nats.publish(SUBJECTS.CONNECTION_OAUTH_COMPLETED, {
      orgId: client.orgId,
      workspaceId: client.workspaceId,
      connectionRefId: payload.connectionRefId,
      provider: payload.provider,
    });
  }

  private async handleConnectionCompleted(
    client: AuthenticatedSocket,
    payload: { providerConfigKey: string; connectionId: string; endUserId: string },
  ) {
    if (!client.workspaceId) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Not authenticated' } });
      return;
    }

    await this.nats.publish(SUBJECTS.CONNECTION_COMPLETED, {
      orgId: client.orgId,
      workspaceId: client.workspaceId,
      providerConfigKey: payload.providerConfigKey,
      connectionId: payload.connectionId,
      endUserId: payload.endUserId,
    });
  }

  private async handlePlanConfirm(
    client: AuthenticatedSocket,
    payload: {
      commandId: string;
      name: string;
      naturalLanguageCommand: string;
      triggerType: string;
      schedule?: string;
      connectors: string[];
      steps: any[];
      endUserId?: string;
    },
  ) {
    if (!client.workspaceId) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Not authenticated' } });
      return;
    }

    await this.nats.publish(SUBJECTS.AGENT_PLAN_CONFIRMED, {
      orgId: client.orgId,
      workspaceId: client.workspaceId,
      commandId: payload.commandId,
      name: payload.name,
      naturalLanguageCommand: payload.naturalLanguageCommand,
      triggerType: payload.triggerType,
      schedule: payload.schedule,
      connectors: payload.connectors,
      steps: payload.steps,
      endUserId: payload.endUserId,
    });
  }

  private send(client: WebSocket, data: { type: string; payload?: unknown }) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }
}
