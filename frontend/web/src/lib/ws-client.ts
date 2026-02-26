type MessageHandler = (msg: { type: string; payload?: any }) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers: MessageHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private apiKey: string | null = null;

  connect(apiKey: string) {
    this.apiKey = apiKey;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002/ws';

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.send({ type: 'auth', payload: { apiKey } });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handlers.forEach((h) => h(msg));
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(msg: { type: string; payload?: any }) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  submitCommand(command: string) {
    this.send({
      type: 'agent_command_submit',
      payload: { naturalLanguageCommand: command },
    });
  }

  sendOAuthComplete(connectionRefId: string, provider: string) {
    this.send({
      type: 'oauth_complete',
      payload: { connectionRefId, provider },
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.apiKey) {
        console.log('Reconnecting WebSocket...');
        this.connect(this.apiKey);
      }
    }, 3000);
  }
}

export const wsClient = new WsClient();
