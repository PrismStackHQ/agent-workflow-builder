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
    // Client must send auth message first
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
    if (client.orgId) {
      this.wsService.unregister(client.orgId, client);
      this.logger.log(`Socket disconnected for org ${client.orgId}`);
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

    const org = await this.prisma.organization.findFirst({
      where: { apiKey: payload.apiKey, deletedAt: null },
    });

    if (!org) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Invalid API key' } });
      return;
    }

    client.orgId = org.id;
    client.orgName = org.name;
    this.wsService.register(org.id, client);

    this.send(client, {
      type: 'auth_success',
      payload: { orgId: org.id, orgName: org.name },
    });
  }

  private async handleAgentCommand(client: AuthenticatedSocket, payload: { naturalLanguageCommand: string }) {
    if (!client.orgId) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Not authenticated' } });
      return;
    }

    const { randomUUID } = await import('crypto');
    const commandId = randomUUID();

    await this.nats.publish(SUBJECTS.AGENT_COMMAND_SUBMITTED, {
      orgId: client.orgId,
      commandId,
      naturalLanguageCommand: payload.naturalLanguageCommand,
    });

    this.send(client, {
      type: 'command_accepted',
      payload: { commandId, status: 'processing' },
    });
  }

  private async handleOAuthComplete(client: AuthenticatedSocket, payload: { connectionRefId: string; provider: string }) {
    if (!client.orgId) {
      this.send(client, { type: 'auth_failed', payload: { reason: 'Not authenticated' } });
      return;
    }

    await this.nats.publish(SUBJECTS.CONNECTION_OAUTH_COMPLETED, {
      orgId: client.orgId,
      connectionRefId: payload.connectionRefId,
      provider: payload.provider,
    });
  }

  private send(client: WebSocket, data: { type: string; payload?: unknown }) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }
}
