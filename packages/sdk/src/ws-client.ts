import WebSocket from 'ws';
import { ClientOptions, EventMap, EventName } from './types';

const EVENT_TYPE_MAP: Record<string, EventName> = {
  agent_run_started: 'run:started',
  agent_run_step_completed: 'run:step_completed',
  agent_run_succeeded: 'run:succeeded',
  agent_run_failed: 'run:failed',
  agent_run_paused: 'run:paused',
  agent_run_resumed: 'run:resumed',
  agent_created: 'agent:created',
  agent_scheduled: 'agent:scheduled',
};

type EventHandler<E extends EventName> = (payload: EventMap[E]) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private readonly wsUrl: string;
  private readonly apiKey: string;
  private listeners = new Map<string, Set<Function>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = false;

  constructor(options: ClientOptions) {
    this.apiKey = options.apiKey;
    const base = options.wsUrl || options.baseUrl || 'ws://localhost:3002';
    this.wsUrl = base.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';
  }

  connect(): Promise<void> {
    this.shouldReconnect = true;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      let resolved = false;

      this.ws.on('open', () => {
        this.ws!.send(
          JSON.stringify({ type: 'auth', payload: { apiKey: this.apiKey } }),
        );
      });

      this.ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());

          if (msg.type === 'auth_success') {
            this.startPing();
            if (!resolved) {
              resolved = true;
              resolve();
            }
            return;
          }

          if (msg.type === 'auth_failed') {
            if (!resolved) {
              resolved = true;
              reject(
                new Error(
                  `WebSocket auth failed: ${msg.payload?.reason || 'unknown'}`,
                ),
              );
            }
            return;
          }

          if (msg.type === 'pong') return;

          const sdkEvent = EVENT_TYPE_MAP[msg.type];
          if (sdkEvent && msg.payload) {
            this.emit(sdkEvent, msg.payload);
          }
        } catch {
          // ignore parse errors
        }
      });

      this.ws.on('close', () => {
        this.stopPing();
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(
            () => this.doConnect().catch(() => {}),
            3000,
          );
        }
      });

      this.ws.on('error', () => {
        // errors trigger close, handled there
      });
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  on<E extends EventName>(event: E, handler: EventHandler<E>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off<E extends EventName>(event: E, handler: EventHandler<E>): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: string, payload: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const h of handlers) {
        try {
          (h as Function)(payload);
        } catch {
          // ignore handler errors
        }
      }
    }
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
