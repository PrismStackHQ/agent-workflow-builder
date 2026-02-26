import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';

@Injectable()
export class WsService {
  private readonly logger = new Logger(WsService.name);
  private readonly orgSockets = new Map<string, Set<WebSocket>>();

  register(orgId: string, socket: WebSocket) {
    if (!this.orgSockets.has(orgId)) {
      this.orgSockets.set(orgId, new Set());
    }
    this.orgSockets.get(orgId)!.add(socket);
    this.logger.log(`Socket registered for org ${orgId}`);
  }

  unregister(orgId: string, socket: WebSocket) {
    const sockets = this.orgSockets.get(orgId);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        this.orgSockets.delete(orgId);
      }
    }
  }

  sendToOrg(orgId: string, message: { type: string; payload?: unknown }) {
    const sockets = this.orgSockets.get(orgId);
    if (!sockets || sockets.size === 0) {
      this.logger.debug(`No sockets for org ${orgId}, dropping message ${message.type}`);
      return;
    }

    const data = JSON.stringify(message);
    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    }
  }
}
