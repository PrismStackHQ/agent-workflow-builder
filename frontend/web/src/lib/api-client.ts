const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

class ApiClient {
  private apiKey: string | null = null;

  setApiKey(key: string) {
    this.apiKey = key;
    if (typeof window !== 'undefined') {
      localStorage.setItem('apiKey', key);
    }
  }

  getApiKey(): string | null {
    if (this.apiKey) return this.apiKey;
    if (typeof window !== 'undefined') {
      this.apiKey = localStorage.getItem('apiKey');
    }
    return this.apiKey;
  }

  setOrgId(orgId: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orgId', orgId);
    }
  }

  getOrgId(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('orgId');
    }
    return null;
  }

  setWorkspaceId(workspaceId: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('workspaceId', workspaceId);
    }
  }

  getWorkspaceId(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('workspaceId');
    }
    return null;
  }

  clearAuth() {
    this.apiKey = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('apiKey');
      localStorage.removeItem('orgId');
      localStorage.removeItem('orgName');
      localStorage.removeItem('workspaceId');
      localStorage.removeItem('workspaceName');
      localStorage.removeItem('workspaces');
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const key = this.getApiKey();
    if (key) h['X-API-Key'] = key;
    return h;
  }

  // Auth endpoints
  async authSignUp(name: string, orgEmail: string, firebaseUid: string) {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, orgEmail, firebaseUid }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Signup failed');
    }
    return res.json();
  }

  async authLogin(firebaseUid: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firebaseUid }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Login failed');
    }
    return res.json();
  }

  // Workspace endpoints
  async listWorkspaces() {
    const res = await fetch(`${API_BASE}/workspaces`, { headers: this.headers() });
    return res.json();
  }

  async createWorkspace(name: string) {
    const res = await fetch(`${API_BASE}/workspaces`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ name }),
    });
    return res.json();
  }

  // Org endpoints
  async createOrg(name: string, orgEmail: string) {
    const res = await fetch(`${API_BASE}/orgs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, orgEmail }),
    });
    return res.json();
  }

  async getOrg(orgId: string) {
    const res = await fetch(`${API_BASE}/orgs/${orgId}`, { headers: this.headers() });
    return res.json();
  }

  async getConnectionConfig() {
    const res = await fetch(`${API_BASE}/config/connection-endpoint`, { headers: this.headers() });
    return res.json();
  }

  async configureConnectionEndpoint(provider: string, url: string, apiKey: string) {
    const res = await fetch(`${API_BASE}/config/connection-endpoint`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ integrationProvider: provider, connectionEndpointUrl: url, connectionEndpointApiKey: apiKey }),
    });
    return res.json();
  }

  async listAvailableIntegrations() {
    const res = await fetch(`${API_BASE}/integrations`, { headers: this.headers() });
    return res.json();
  }

  async syncIntegrations() {
    const res = await fetch(`${API_BASE}/integrations/sync`, {
      method: 'POST',
      headers: this.headers(),
    });
    return res.json();
  }

  async configureRagEndpoint(url: string, apiKey: string) {
    const res = await fetch(`${API_BASE}/config/rag-endpoint`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ ragEndpointUrl: url, ragEndpointApiKey: apiKey }),
    });
    return res.json();
  }

  async createConnection(provider: string, externalRefId: string) {
    const res = await fetch(`${API_BASE}/connections`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ provider, externalRefId }),
    });
    return res.json();
  }

  async listConnections() {
    const res = await fetch(`${API_BASE}/connections`, { headers: this.headers() });
    return res.json();
  }

  async markConnectionReady(refId: string) {
    const res = await fetch(`${API_BASE}/connections/${refId}/ready`, {
      method: 'PATCH',
      headers: this.headers(),
    });
    return res.json();
  }

  async submitAgentCommand(command: string) {
    const res = await fetch(`${API_BASE}/agents/command`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ naturalLanguageCommand: command }),
    });
    return res.json();
  }

  async listAgents() {
    const res = await fetch(`${API_BASE}/agents`, { headers: this.headers() });
    return res.json();
  }

  async getAgent(agentId: string) {
    const res = await fetch(`${API_BASE}/agents/${agentId}`, { headers: this.headers() });
    return res.json();
  }

  async listRuns(agentId: string) {
    const res = await fetch(`${API_BASE}/agents/${agentId}/runs`, { headers: this.headers() });
    return res.json();
  }

  async deleteAgent(agentId: string) {
    const res = await fetch(`${API_BASE}/agents/${agentId}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    return res.json();
  }
}

export const apiClient = new ApiClient();
