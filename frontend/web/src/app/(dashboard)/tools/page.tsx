'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ToolEntry {
  id: string;
  integrationKey: string;
  actionName: string;
  displayName: string;
  description: string | null;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  syncedAt: string;
}

function formatSyncTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    setLoading(true);
    try {
      const data = await apiClient.listTools();
      if (Array.isArray(data)) setTools(data);
    } catch {
      setStatus('Failed to load tools');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setStatus('');
    try {
      const result = await apiClient.syncTools();
      setStatus(`Synced ${result.toolCount ?? 0} tools from provider`);
      await loadTools();
    } catch {
      setStatus('Failed to sync tools');
    } finally {
      setSyncing(false);
    }
  };

  // Group tools by integrationKey
  const integrationKeys = [...new Set(tools.map((t) => t.integrationKey))].sort();
  const filteredTools = filterKey
    ? tools.filter((t) => t.integrationKey === filterKey)
    : tools;

  const lastSynced = tools.length > 0
    ? tools.reduce((latest, t) => (t.syncedAt > latest ? t.syncedAt : latest), tools[0].syncedAt)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
          <p className="text-sm text-gray-500 mt-1">
            Actions and syncs available from your integration provider.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastSynced && (
            <span className="text-xs text-gray-400">
              Last synced: {formatSyncTime(lastSynced)}
            </span>
          )}
          <Button onClick={handleSync} loading={syncing} variant="secondary">
            <svg className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
            </svg>
            Sync Tools
          </Button>
        </div>
      </div>

      {status && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          {status}
        </div>
      )}

      {tools.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384-3.19A1.5 1.5 0 015 10.62V5.25a1.5 1.5 0 011.036-1.427l5.384-1.685a1.5 1.5 0 01.928 0l5.384 1.685A1.5 1.5 0 0119 5.25v5.37a1.5 1.5 0 01-1.036 1.36l-5.384 3.19a1.5 1.5 0 01-1.16 0z" />
              </svg>
              <p className="text-gray-500 mb-2">No tools synced yet.</p>
              <p className="text-sm text-gray-400 mb-4">
                Configure your integration provider in Integrations, then sync tools to discover available actions.
              </p>
              <Button onClick={handleSync} loading={syncing}>
                Sync from Provider
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Integration filter tabs */}
          {integrationKeys.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterKey('')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  !filterKey
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All ({tools.length})
              </button>
              {integrationKeys.map((key) => {
                const count = tools.filter((t) => t.integrationKey === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterKey(key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      filterKey === key
                        ? 'bg-indigo-100 text-indigo-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {key} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Tools list */}
          <div className="space-y-3">
            {filteredTools.map((tool) => (
              <Card key={tool.id}>
                <div
                  className="px-6 py-4 cursor-pointer"
                  onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">{tool.displayName}</h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                          {tool.integrationKey}
                        </span>
                      </div>
                      {tool.description && (
                        <p className="text-sm text-gray-500 line-clamp-2">{tool.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 font-mono">{tool.actionName}</p>
                    </div>
                    <svg
                      className={`w-5 h-5 text-gray-400 shrink-0 ml-4 transition-transform ${expandedTool === tool.id ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>

                {expandedTool === tool.id && (
                  <div className="px-6 pb-4 border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {tool.inputSchema && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Input Schema</h4>
                          <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
                            {JSON.stringify(tool.inputSchema, null, 2)}
                          </pre>
                        </div>
                      )}
                      {tool.outputSchema && (
                        <div>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Output Schema</h4>
                          <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-x-auto max-h-64 overflow-y-auto">
                            {JSON.stringify(tool.outputSchema, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                    {!tool.inputSchema && !tool.outputSchema && (
                      <p className="text-sm text-gray-400">No schema information available for this tool.</p>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
