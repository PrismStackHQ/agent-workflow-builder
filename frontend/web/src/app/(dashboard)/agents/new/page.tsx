'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useWebSocket } from '@/hooks/use-websocket';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function CreateAgentPage() {
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
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Create Agent</h1>

      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-sm text-gray-500">
          {connected ? 'WebSocket connected' : 'WebSocket disconnected'}
        </span>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">Describe your workflow</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Use natural language to describe what your agent should do.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder='e.g., "Create a task to run every day where read emails from my gmail and find the receipts and upload to the gdrive"'
              rows={4}
              className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 placeholder:text-gray-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:border-gray-300"
            />
            <Button type="submit" loading={submitting} disabled={!command.trim()}>
              {submitting ? 'Processing...' : 'Create Agent'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {oauthWaits.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader>
            <h2 className="text-base font-semibold text-yellow-800">OAuth Required</h2>
            <p className="text-sm text-yellow-700 mt-0.5">
              The following connections need authorization before the agent can be created:
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {oauthWaits.map((wait) => (
                <div key={wait.provider} className="flex items-center justify-between bg-white rounded-xl border border-yellow-200 p-3">
                  <span className="font-medium capitalize text-gray-900">{wait.provider}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleOAuthComplete(wait.provider, wait.connectionRefId)}
                    className="!border-yellow-300 !text-yellow-800 hover:!bg-yellow-100"
                  >
                    Complete OAuth
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {agentCreated && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <h2 className="text-base font-semibold text-green-800">Agent Created!</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm text-green-700">
              <p><span className="font-medium">Name:</span> {agentCreated.name}</p>
              <p><span className="font-medium">Schedule:</span> {agentCreated.scheduleCron}</p>
              {agentCreated.scheduled && (
                <p><span className="font-medium">Status:</span> Scheduled on Kubernetes</p>
              )}
            </div>
            <Link href="/agents" className="inline-block mt-3 text-sm text-green-700 font-medium hover:underline">
              View all agents →
            </Link>
          </CardContent>
        </Card>
      )}

      {messages.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Event Log</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto font-mono text-sm bg-gray-50 rounded-lg p-3">
              {messages.map((msg, i) => (
                <div key={i} className="text-gray-600">
                  <span className="text-gray-400">[{msg.type}]</span>{' '}
                  {msg.payload ? JSON.stringify(msg.payload) : ''}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
