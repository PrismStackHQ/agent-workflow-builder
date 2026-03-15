'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { useWebSocket } from '@/hooks/use-websocket';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AgentsListPage() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [resuming, setResuming] = useState<string | null>(null);
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('apiKey') : null;
  const { connected, lastMessage } = useWebSocket(apiKey);

  useEffect(() => {
    loadAgents();
  }, []);

  useEffect(() => {
    if (!lastMessage) return;
    if (
      [
        'agent_created',
        'agent_scheduled',
        'agent_run_started',
        'agent_run_succeeded',
        'agent_run_failed',
        'agent_run_paused',
        'agent_run_resumed',
      ].includes(lastMessage.type)
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

  const handleResume = async (run: any) => {
    setResuming(run.id);
    try {
      await apiClient.resumeRun(run.agentId, run.id, run.endUserConnectionId || '');
    } catch {
      // Will be updated via WebSocket
    } finally {
      setResuming(null);
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
      case 'PAUSED': return 'bg-amber-100 text-amber-700';
      case 'FAILED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const parsePauseReason = (reason: string | null) => {
    if (!reason) return null;
    if (reason.startsWith('connection_required:')) {
      return reason.replace('connection_required:', '');
    }
    return reason;
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-400">{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-gray-500 py-8 text-center">
              No workflows created yet. Use the SDK or Chat App to create one.
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

                    {/* Paused run info and resume */}
                    {run.status === 'PAUSED' && (
                      <div className="mt-3 pt-3 border-t border-amber-100 bg-amber-50/50 -mx-4 -mb-4 px-4 pb-4 rounded-b-xl">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-amber-800">
                              Paused — connection required
                            </p>
                            {run.pauseReason && (
                              <p className="text-xs text-amber-600 mt-0.5">
                                Integration: <span className="font-mono">{parsePauseReason(run.pauseReason)}</span>
                              </p>
                            )}
                            {run.pausedAt && (
                              <p className="text-xs text-amber-500 mt-0.5">
                                Paused at step {run.pausedAtStepIndex ?? '?'} on {new Date(run.pausedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={resuming === run.id}
                            onClick={() => handleResume(run)}
                            className="!text-xs !border-amber-300 !text-amber-800 hover:!bg-amber-100"
                          >
                            <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                            </svg>
                            Resume Run
                          </Button>
                        </div>
                      </div>
                    )}
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
