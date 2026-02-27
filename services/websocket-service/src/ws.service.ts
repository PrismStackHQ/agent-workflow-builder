import { Injectable, Logger } from '@nestjs/common';
import { WebSocket } from 'ws';

@Injectable()
export class WsService {
  private readonly logger = new Logger(WsService.name);
  private readonly workspaceSockets = new Map<string, Set<WebSocket>>();

  register(workspaceId: string, socket: WebSocket) {
    if (!this.workspaceSockets.has(workspaceId)) {
      this.workspaceSockets.set(workspaceId, new Set());
    }
    this.workspaceSockets.get(workspaceId)!.add(socket);
    this.logger.log(`Socket registered for workspace ${workspaceId}`);
  }

  unregister(workspaceId: string, socket: WebSocket) {
    const sockets = this.workspaceSockets.get(workspaceId);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        this.workspaceSockets.delete(workspaceId);
      }
    }
  }

  sendToWorkspace(workspaceId: string, message: { type: string; payload?: unknown }) {
    const sockets = this.workspaceSockets.get(workspaceId);
    if (!sockets || sockets.size === 0) {
      this.logger.debug(`No sockets for workspace ${workspaceId}, dropping message ${message.type}`);
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
