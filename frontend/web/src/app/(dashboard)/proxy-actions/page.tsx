'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProxyActionEditor } from '@/components/proxy-action-editor';

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

const SOURCE_TYPE_COLORS: Record<string, string> = {
  action: 'bg-blue-100 text-blue-700',
  sync: 'bg-emerald-100 text-emerald-700',
  proxy: 'bg-purple-100 text-purple-700',
};

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PUT: 'bg-amber-100 text-amber-700',
  PATCH: 'bg-orange-100 text-orange-700',
  DELETE: 'bg-red-100 text-red-700',
};

const TYPE_COLORS: Record<string, string> = {
  SEARCH: 'bg-purple-100 text-purple-700',
  LIST: 'bg-cyan-100 text-cyan-700',
  GET: 'bg-emerald-100 text-emerald-700',
  CREATE: 'bg-blue-100 text-blue-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
  DOWNLOAD: 'bg-teal-100 text-teal-700',
  SEND: 'bg-indigo-100 text-indigo-700',
};

export default function ProxyActionsPage() {
  const [actions, setActions] = useState<ProxyAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [editingAction, setEditingAction] = useState<ProxyAction | null>(null);

  const loadActions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.listProxyActions();
      if (Array.isArray(data)) setActions(data);
    } catch {
      setStatus('Failed to load proxy actions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  const handleToggle = async (action: ProxyAction) => {
    try {
      const updated = await apiClient.toggleProxyAction(action.id);
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : 'Failed to toggle');
    }
  };

  const handleSave = async (id: string, data: Record<string, unknown>) => {
    const updated = await apiClient.updateProxyAction(id, data);
    setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditingAction(null);
  };

  const handleDelete = async (id: string) => {
    await apiClient.deleteProxyAction(id);
    setActions((prev) => prev.filter((a) => a.id !== id));
    setEditingAction(null);
  };

  const providers = [...new Set(actions.map((a) => a.providerConfigKey))].sort();
  const filteredActions = filterKey
    ? actions.filter((a) => a.providerConfigKey === filterKey)
    : actions;

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
          <h1 className="text-2xl font-bold text-gray-900">Proxy Actions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage proxy action definitions that map to third-party API endpoints.
          </p>
        </div>
        <Button onClick={loadActions} variant="secondary">
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
          </svg>
          Refresh
        </Button>
      </div>

      {status && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {status}
          <button onClick={() => setStatus('')} className="ml-auto text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {actions.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-center py-12">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
              </svg>
              <p className="text-gray-500 mb-2">No proxy actions found.</p>
              <p className="text-sm text-gray-400 mb-4">
                Sync your tools to auto-generate proxy action definitions for connected integrations.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Provider filter tabs */}
          {providers.length > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilterKey('')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  !filterKey
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All ({actions.length})
              </button>
              {providers.map((key) => {
                const count = actions.filter((a) => a.providerConfigKey === key).length;
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

          {/* Actions table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Action</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Provider</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Source</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Type</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Method</th>
                    <th className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Endpoint</th>
                    <th className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Enabled</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredActions.map((action) => (
                    <tr
                      key={action.id}
                      className="group hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => setEditingAction(action)}
                    >
                      <td className="px-6 py-3.5">
                        <p className="text-sm font-semibold text-gray-900">{action.displayName}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{action.actionName}</p>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">
                          {action.providerConfigKey}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${SOURCE_TYPE_COLORS[action.type] || 'bg-gray-100 text-gray-600'}`}>
                          {action.type}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-lg ${TYPE_COLORS[action.actionType] || 'bg-gray-100 text-gray-600'}`}>
                          {action.actionType}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${METHOD_COLORS[action.method] || 'bg-gray-100 text-gray-600'}`}>
                          {action.method}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="text-xs font-mono text-gray-500 max-w-[200px] truncate block">
                          {action.endpoint}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggle(action); }}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            action.isEnabled ? 'bg-indigo-500' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                            style={{ transform: `translateX(${action.isEnabled ? '18px' : '4px'})` }}
                          />
                        </button>
                      </td>
                      <td className="px-3 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingAction(action); }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-indigo-600 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Editor slide-over */}
      {editingAction && (
        <ProxyActionEditor
          key={editingAction.id + editingAction.updatedAt}
          action={editingAction}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setEditingAction(null)}
        />
      )}
    </div>
  );
}
