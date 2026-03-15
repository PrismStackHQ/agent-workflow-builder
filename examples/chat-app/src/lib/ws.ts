import type { WsServerMessage } from './types';

type MessageHandler = (msg: WsServerMessage) => void;

class BrowserWsClient {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wsUrl: string = '';
  private apiKey: string = '';

  connect(wsUrl: string, apiKey: string) {
    this.wsUrl = wsUrl;
    this.apiKey = apiKey;
    this.shouldReconnect = true;
    this.doConnect();
  }

  private doConnect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({ type: 'auth', payload: { apiKey: this.apiKey } }));
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WsServerMessage = JSON.parse(event.data);
          this.handlers.forEach((h) => h(msg));
        } catch {
          // ignore malformed messages
        }
      };

      this.ws.onclose = () => {
        this.stopPing();
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.doConnect(), 3000);
      }
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  send(type: string, payload?: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  submitCommand(command: string, endUserId?: string) {
    this.send('agent_command_submit', { naturalLanguageCommand: command, endUserId });
  }

  sendOAuthComplete(connectionRefId: string, provider: string) {
    this.send('oauth_complete', { connectionRefId, provider });
  }

  sendConnectionCompleted(providerConfigKey: string, connectionId: string, endUserId: string) {
    this.send('connection_completed', { providerConfigKey, connectionId, endUserId });
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new BrowserWsClient();
