import { ClientOptions } from './types';

export class AgentWorkflowError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = 'AgentWorkflowError';
  }
}

export class RestClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: ClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl =
      (options.baseUrl || 'http://localhost:3001').replace(/\/+$/, '') + '/api/v1';
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new AgentWorkflowError(
        `GET ${path} failed (${res.status}): ${body}`,
        res.status,
      );
    }
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AgentWorkflowError(
        `POST ${path} failed (${res.status}): ${text}`,
        res.status,
      );
    }
    return res.json() as Promise<T>;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AgentWorkflowError(
        `PUT ${path} failed (${res.status}): ${text}`,
        res.status,
      );
    }
    return res.json() as Promise<T>;
  }

  async del(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AgentWorkflowError(
        `DELETE ${path} failed (${res.status}): ${text}`,
        res.status,
      );
    }
  }
}
