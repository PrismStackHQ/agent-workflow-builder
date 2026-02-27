'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useWebSocket } from '@/hooks/use-websocket';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AgentsListPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('apiKey') : null;
  const { connected, lastMessage } = useWebSocket(apiKey);

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    if (
      ['agent_created', 'agent_scheduled', 'agent_run_started', 'agent_run_succeeded', 'agent_run_failed'].includes(
        lastMessage.type,
      )
    ) {
      loadAgents();
      if (selectedAgent) loadRuns(selectedAgent);
    }
  }, [lastMessage, selectedAgent]);

  const loadAgents = async () => {
    try {
      const data = await apiClient.listAgents();
      if (Array.isArray(data)) setAgents(data);
    } catch {}
  };

  const loadRuns = async (agentId: string) => {
    try {
      const data = await apiClient.listRuns(agentId);
      if (Array.isArray(data)) setRuns(data);
    } catch {}
  };

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgent(agentId);
    loadRuns(agentId);
  };

  const handleDelete = async (agentId: string) => {
    if (!confirm('Delete this agent?')) return;
    await apiClient.deleteAgent(agentId);
    loadAgents();
    if (selectedAgent === agentId) {
      setSelectedAgent(null);
      setRuns([]);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'bg-green-100 text-green-700';
      case 'READY': return 'bg-blue-100 text-blue-700';
      case 'WAITING_CONNECTIONS': return 'bg-yellow-100 text-yellow-700';
      case 'DRAFT': return 'bg-gray-100 text-gray-700';
      case 'SUCCEEDED': return 'bg-green-100 text-green-700';
      case 'RUNNING': return 'bg-blue-100 text-blue-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agents</h1>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-400">{connected ? 'Live' : 'Offline'}</span>
          <Link href="/agents/new">
            <Button size="sm">Create Agent</Button>
          </Link>
        </div>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-gray-500 py-8 text-center">
              No agents created yet.{' '}
              <Link href="/agents/new" className="text-indigo-600 font-medium hover:underline">
                Create one
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Agent list */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Agent Definitions
            </h2>
            <div className="space-y-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent.id)}
                  className={`bg-white border rounded-xl p-4 cursor-pointer transition-all duration-150 ${
                    selectedAgent === agent.id
                      ? 'border-indigo-300 ring-2 ring-indigo-100 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-gray-900 truncate flex-1">{agent.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ml-2 ${statusColor(agent.status)}`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 truncate">{agent.naturalLanguageCommand}</p>
                  <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-400">
                      Schedule: {agent.scheduleCron || 'None'}
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleDelete(agent.id); }}
                      className="!px-2 !py-1 !text-xs !rounded-lg"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Runs panel */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              {selectedAgent ? 'Agent Runs' : 'Select an agent to view runs'}
            </h2>
            {runs.length === 0 && selectedAgent ? (
              <Card>
                <CardContent>
                  <p className="text-gray-500 py-6 text-center text-sm">No runs yet for this agent.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {runs.map((run) => (
                  <div key={run.id} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-mono text-sm text-gray-600">{run.id.substring(0, 8)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(run.status)}`}>
                        {run.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {run.startedAt && <span>Started: {new Date(run.startedAt).toLocaleString()}</span>}
                      {run.endedAt && <span className="ml-2">Ended: {new Date(run.endedAt).toLocaleString()}</span>}
                    </div>
                    {run.errorMessage && (
                      <p className="text-xs text-red-600 mt-1">{run.errorMessage}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Steps completed: {run.stepsCompleted}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
