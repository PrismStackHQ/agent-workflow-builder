'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProxyActionEditor } from '@/components/proxy-action-editor';

interface ToolEntry {
  id: string;
  integrationKey: string;
  actionName: string;
  displayName: string;
  description: string | null;
  type: string | null;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  rawDefinition: Record<string, unknown> | null;
  syncedAt: string;
}

interface ProxyAction {
  id: string;
  workspaceId: string;
  providerConfigKey: string;
  actionName: string;
  actionType: string;
  displayName: string;
  description: string | null;
  method: string;
  endpoint: string;
  paramsConfig: Record<string, unknown> | null;
  bodyConfig: Record<string, unknown> | null;
  headersConfig: Record<string, unknown> | null;
  responseConfig: Record<string, unknown> | null;
  postProcessConfig: Record<string, unknown> | null;

  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  type: string;
  isEnabled: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const TOOL_TYPE_COLORS: Record<string, string> = {
  action: 'bg-blue-100 text-blue-700',
  sync: 'bg-emerald-100 text-emerald-700',
  proxy: 'bg-purple-100 text-purple-700',
};

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
  const [proxyActions, setProxyActions] = useState<ProxyAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [filterType, setFilterType] = useState('');
  const [editingProxyAction, setEditingProxyAction] = useState<ProxyAction | null>(null);
  const [viewingTool, setViewingTool] = useState<ToolEntry | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsData, proxyData] = await Promise.all([
        apiClient.listTools(),
        apiClient.listProxyActions(),
      ]);
      if (Array.isArray(toolsData)) setTools(toolsData);
      if (Array.isArray(proxyData)) setProxyActions(proxyData);
    } catch {
      setStatus('Failed to load tools');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSync = async () => {
    setSyncing(true);
    setStatus('');
    try {
      const result = await apiClient.syncTools();
      setStatus(`Synced ${result.toolCount ?? 0} tools from provider`);
      await loadData();
    } catch {
      setStatus('Failed to sync tools');
    } finally {
      setSyncing(false);
    }
  };

  const handleToolClick = (tool: ToolEntry) => {
    if (tool.type === 'proxy') {
      // Find the matching ProxyActionDefinition
      const proxyAction = proxyActions.find((pa) => pa.actionName === tool.actionName);
      if (proxyAction) {
        setEditingProxyAction(proxyAction);
      }
    } else {
      setViewingTool(tool);
    }
  };

  const handleProxySave = async (id: string, data: Record<string, unknown>) => {
    const updated = await apiClient.updateProxyAction(id, data);
    setProxyActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditingProxyAction(null);
    // Reload tools to reflect changes
    const toolsData = await apiClient.listTools();
    if (Array.isArray(toolsData)) setTools(toolsData);
  };

  const handleProxyDelete = async (id: string) => {
    await apiClient.deleteProxyAction(id);
    setProxyActions((prev) => prev.filter((a) => a.id !== id));
    setEditingProxyAction(null);
    // Reload tools to reflect deletion
    const toolsData = await apiClient.listTools();
    if (Array.isArray(toolsData)) setTools(toolsData);
  };

  const handleProxyToggle = async (tool: ToolEntry) => {
    const proxyAction = proxyActions.find((pa) => pa.actionName === tool.actionName);
    if (!proxyAction) return;
    try {
      const updated = await apiClient.toggleProxyAction(proxyAction.id);
      setProxyActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : 'Failed to toggle');
    }
  };

  // Filters
  const integrationKeys = [...new Set(tools.map((t) => t.integrationKey))].sort();
  const toolTypes = [...new Set(tools.map((t) => t.type).filter(Boolean))].sort() as string[];

  let filteredTools = tools;
  if (filterKey) filteredTools = filteredTools.filter((t) => t.integrationKey === filterKey);
  if (filterType) filteredTools = filteredTools.filter((t) => t.type === filterType);

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
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
          <p className="text-sm text-gray-500 mt-1">
            Actions, syncs, and proxy definitions from your integration provider.
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
          <button onClick={() => setStatus('')} className="ml-auto text-indigo-400 hover:text-indigo-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
          {/* Filter tabs */}
          <div className="space-y-3">
            {/* Integration filter */}
            {integrationKeys.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Provider:</span>
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

            {/* Type filter */}
            {toolTypes.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Type:</span>
                <button
                  onClick={() => setFilterType('')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    !filterType
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                {toolTypes.map((type) => {
                  const count = tools.filter((t) => t.type === type).length;
                  return (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        filterType === type
                          ? TOOL_TYPE_COLORS[type] || 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {type} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tools table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Tool</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Provider</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Type</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Synced</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTools.map((tool) => {
                    const isProxy = tool.type === 'proxy';
                    const proxyAction = isProxy ? proxyActions.find((pa) => pa.actionName === tool.actionName) : null;

                    return (
                      <tr
                        key={tool.id}
                        className="group hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => handleToolClick(tool)}
                      >
                        <td className="px-6 py-3.5">
                          <p className="text-sm font-semibold text-gray-900">{tool.displayName}</p>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{tool.actionName}</p>
                          {tool.description && (
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{tool.description}</p>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">
                            {tool.integrationKey}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          {tool.type && (
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${TOOL_TYPE_COLORS[tool.type] || 'bg-gray-100 text-gray-600'}`}>
                              {tool.type}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="text-xs text-gray-400">
                            {formatSyncTime(tool.syncedAt)}
                          </span>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2">
                            {/* Toggle for proxy tools */}
                            {isProxy && proxyAction && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleProxyToggle(tool); }}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                  proxyAction.isEnabled ? 'bg-indigo-500' : 'bg-gray-300'
                                }`}
                              >
                                <span
                                  className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                                  style={{ transform: `translateX(${proxyAction.isEnabled ? '18px' : '4px'})` }}
                                />
                              </button>
                            )}
                            {/* Edit/view icon */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToolClick(tool); }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600 transition-all"
                            >
                              {isProxy ? (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Proxy Action Editor (editable) */}
      {editingProxyAction && (
        <ProxyActionEditor
          key={editingProxyAction.id + editingProxyAction.updatedAt}
          action={editingProxyAction}
          onSave={handleProxySave}
          onDelete={handleProxyDelete}
          onClose={() => setEditingProxyAction(null)}
        />
      )}

      {/* Tool Detail Viewer (read-only for action/sync) */}
      {viewingTool && (
        <ToolDetailViewer
          tool={viewingTool}
          onClose={() => setViewingTool(null)}
        />
      )}
    </div>
  );
}

/** Read-only slide-over for viewing action/sync tool details */
function ToolDetailViewer({ tool, onClose }: { tool: ToolEntry; onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Slide-over panel */}
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-gray-900">Tool Details</h3>
            {tool.type && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${TOOL_TYPE_COLORS[tool.type] || 'bg-gray-100 text-gray-600'}`}>
                {tool.type}
              </span>
            )}
            <span className="text-[10px] font-medium bg-amber-50 text-amber-600 px-2 py-0.5 rounded-lg">
              Read Only
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Info */}
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Basic Info
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <ReadOnlyField label="Display Name" value={tool.displayName} />
              <ReadOnlyField label="Action Name" value={tool.actionName} mono />
              <ReadOnlyField label="Integration Key" value={tool.integrationKey} mono />
              <ReadOnlyField label="Synced At" value={formatSyncTime(tool.syncedAt)} />
              {tool.description && (
                <div className="col-span-2">
                  <ReadOnlyField label="Description" value={tool.description} />
                </div>
              )}
            </div>
          </section>

          {/* Schemas */}
          {tool.inputSchema && (
            <section>
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Input Schema
              </h4>
              <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-4 overflow-x-auto max-h-80 overflow-y-auto font-mono leading-relaxed">
                {JSON.stringify(tool.inputSchema, null, 2)}
              </pre>
            </section>
          )}

          {tool.outputSchema && (
            <section>
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Output Schema
              </h4>
              <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-4 overflow-x-auto max-h-80 overflow-y-auto font-mono leading-relaxed">
                {JSON.stringify(tool.outputSchema, null, 2)}
              </pre>
            </section>
          )}

          {tool.rawDefinition && (
            <section>
              <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Raw Definition
              </h4>
              <pre className="text-xs text-gray-600 bg-gray-50 rounded-xl p-4 overflow-x-auto max-h-80 overflow-y-auto font-mono leading-relaxed">
                {JSON.stringify(tool.rawDefinition, null, 2)}
              </pre>
            </section>
          )}

          {!tool.inputSchema && !tool.outputSchema && !tool.rawDefinition && (
            <p className="text-sm text-gray-400">No schema or definition information available for this tool.</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-end shrink-0 bg-gray-50">
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className={`px-4 py-3 text-sm border border-gray-100 rounded-xl bg-gray-50 text-gray-700 ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}
