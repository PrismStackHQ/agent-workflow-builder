'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { useWebSocket } from '@/hooks/use-websocket';
import { ProtectedRoute } from '@/components/protected-route';

function CreateAgentContent() {
  const [command, setCommand] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('apiKey') : null;
  const { connected, messages, lastMessage, sendOAuthComplete } = useWebSocket(apiKey);

  const [oauthWaits, setOauthWaits] = useState<
    { provider: string; connectionRefId?: string; agentDraftId?: string }[]
  >([]);
  const [agentCreated, setAgentCreated] = useState<any>(null);

  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'wait_connection_oauth':
        setOauthWaits((prev) => [
          ...prev,
          {
            provider: lastMessage.payload.provider,
            connectionRefId: lastMessage.payload.connectionRefId,
            agentDraftId: lastMessage.payload.agentDraftId,
          },
        ]);
        break;
      case 'agent_created':
        setAgentCreated(lastMessage.payload);
        setSubmitting(false);
        break;
      case 'agent_scheduled':
        setAgentCreated((prev: any) => prev ? { ...prev, scheduled: true, ...lastMessage.payload } : lastMessage.payload);
        break;
    }
  }, [lastMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setOauthWaits([]);
    setAgentCreated(null);

    try {
      await apiClient.submitAgentCommand(command);
    } catch (err) {
      setSubmitting(false);
    }
  };

  const handleOAuthComplete = (provider: string, connectionRefId?: string) => {
    if (connectionRefId) {
      sendOAuthComplete(connectionRefId, provider);
    }
    setOauthWaits((prev) => prev.filter((w) => w.provider !== provider));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Create Agent</h1>

      <div className="mb-4 flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span className="text-sm text-gray-500">
          {connected ? 'WebSocket connected' : 'WebSocket disconnected'}
        </span>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Describe your workflow in natural language
        </label>
        <textarea
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder='e.g., "Create a task to run every day where read emails from my gmail and find the receipts and upload to the gdrive"'
          rows={4}
          className="w-full border border-gray-300 rounded px-3 py-2 mb-4"
        />
        <button
          type="submit"
          disabled={submitting || !command.trim()}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Processing...' : 'Create Agent'}
        </button>
      </form>

      {oauthWaits.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-yellow-800 mb-3">OAuth Required</h2>
          <p className="text-yellow-700 text-sm mb-4">
            The following connections need authorization before the agent can be created:
          </p>
          {oauthWaits.map((wait) => (
            <div key={wait.provider} className="flex items-center justify-between bg-white rounded p-3 mb-2">
              <span className="font-medium capitalize">{wait.provider}</span>
              <button
                onClick={() => handleOAuthComplete(wait.provider, wait.connectionRefId)}
                className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
              >
                Complete OAuth (Mock)
              </button>
            </div>
          ))}
        </div>
      )}

      {agentCreated && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-green-800 mb-2">Agent Created!</h2>
          <p className="text-green-700">
            <strong>Name:</strong> {agentCreated.name}
          </p>
          <p className="text-green-700">
            <strong>Schedule:</strong> {agentCreated.scheduleCron}
          </p>
          {agentCreated.scheduled && (
            <p className="text-green-700">
              <strong>Status:</strong> Scheduled on Kubernetes
            </p>
          )}
          <a href="/agents" className="inline-block mt-3 text-green-700 underline">
            View all agents
          </a>
        </div>
      )}

      {messages.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-3">Event Log</h2>
          <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-sm">
            {messages.map((msg, i) => (
              <div key={i} className="text-gray-600">
                <span className="text-gray-400">[{msg.type}]</span>{' '}
                {msg.payload ? JSON.stringify(msg.payload) : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateAgentPage() {
  return (
    <ProtectedRoute>
      <CreateAgentContent />
    </ProtectedRoute>
  );
}
