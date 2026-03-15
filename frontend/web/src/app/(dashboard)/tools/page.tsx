'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProxyActionEditor } from '@/components/proxy-action-editor';

interface ToolEntry {
  id: string;
  providerConfigKey: string;
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

interface AvailableIntegration {
  id: string;
  providerConfigKey: string;
  displayName: string;
  logoUrl: string | null;
  integrationProvider: string;
}

interface TemplateSummary {
  providerType: string;
  displayName: string;
  description: string;
  actionCount: number;
  isImported: boolean;
  importedActionCount: number;
}

interface TemplateAction {
  actionName: string;
  actionType: string;
  displayName: string;
  description: string;
  method: string;
  endpoint: string;
}

interface TemplateFile {
  schemaVersion: string;
  providerType: string;
  displayName: string;
  description: string;
  actions: TemplateAction[];
}

const TOOL_TYPE_COLORS: Record<string, string> = {
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
  const [showImporter, setShowImporter] = useState(false);

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
      const toolsData = await apiClient.listTools();
      if (Array.isArray(toolsData)) setTools(toolsData);
    } catch {
      setStatus('Failed to sync tools');
    } finally {
      setSyncing(false);
    }
  };

  const handleToolClick = (tool: ToolEntry) => {
    if (tool.type === 'proxy') {
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
    const toolsData = await apiClient.listTools();
    if (Array.isArray(toolsData)) setTools(toolsData);
  };

  const handleProxyDelete = async (id: string) => {
    await apiClient.deleteProxyAction(id);
    setProxyActions((prev) => prev.filter((a) => a.id !== id));
    setEditingProxyAction(null);
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
  const providerConfigKeys = [...new Set(tools.map((t) => t.providerConfigKey))].sort();
  const toolTypes = [...new Set(tools.map((t) => t.type).filter(Boolean))].sort() as string[];

  let filteredTools = tools;
  if (filterKey) filteredTools = filteredTools.filter((t) => t.providerConfigKey === filterKey);
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
          <Button onClick={() => setShowImporter(true)} variant="secondary">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            Import Proxy Tools
          </Button>
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
                Import proxy action templates or sync tools from your integration provider.
              </p>
              <div className="flex items-center justify-center gap-3">
                <Button onClick={() => setShowImporter(true)} variant="secondary">
                  Import Proxy Tools
                </Button>
                <Button onClick={handleSync} loading={syncing}>
                  Sync from Provider
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="space-y-3">
            {providerConfigKeys.length > 1 && (
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
                {providerConfigKeys.map((key) => {
                  const count = tools.filter((t) => t.providerConfigKey === key).length;
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
                            {tool.providerConfigKey}
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

      {editingProxyAction && (
        <ProxyActionEditor
          key={editingProxyAction.id + editingProxyAction.updatedAt}
          action={editingProxyAction}
          onSave={handleProxySave}
          onDelete={handleProxyDelete}
          onClose={() => setEditingProxyAction(null)}
        />
      )}

      {viewingTool && (
        <ToolDetailViewer
          tool={viewingTool}
          onClose={() => setViewingTool(null)}
        />
      )}

      {showImporter && (
        <TemplateImporter
          onClose={() => setShowImporter(false)}
          onImported={loadData}
        />
      )}
    </div>
  );
}

// ---- Template Importer Slide-over ----

function TemplateImporter({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [integrations, setIntegrations] = useState<AvailableIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Review state: selected template to review before import
  const [reviewTemplate, setReviewTemplate] = useState<TemplateFile | null>(null);
  const [selectedIntegration, setSelectedIntegration] = useState('');
  const [importing, setImporting] = useState(false);

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadJson, setUploadJson] = useState('');
  const [uploadPreview, setUploadPreview] = useState<TemplateFile | null>(null);
  const [uploadIntegration, setUploadIntegration] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesData, integrationsData] = await Promise.all([
        apiClient.listProxyActionTemplates(),
        apiClient.listAvailableIntegrations(),
      ]);
      if (Array.isArray(templatesData)) setTemplates(templatesData);
      if (Array.isArray(integrationsData)) setIntegrations(integrationsData);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = async (providerType: string) => {
    setError('');
    setSuccessMsg('');
    try {
      const data = await apiClient.getProxyActionTemplate(providerType);
      setReviewTemplate(data);
      setSelectedIntegration('');
    } catch {
      setError('Failed to load template details');
    }
  };

  const handleApproveImport = async () => {
    if (!reviewTemplate) return;
    if (!selectedIntegration) {
      setError('Please select an integration to assign these tools to');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const result = await apiClient.importProxyActionTemplate(reviewTemplate.providerType, selectedIntegration);
      setSuccessMsg(`Imported ${result.imported} tools for ${reviewTemplate.displayName} (${result.skipped} skipped)`);
      setReviewTemplate(null);
      setSelectedIntegration('');
      await loadData();
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import');
    } finally {
      setImporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setUploadJson(text);
      try {
        const parsed = JSON.parse(text);
        if (parsed.schemaVersion && parsed.providerType && Array.isArray(parsed.actions)) {
          setUploadPreview(parsed);
          setError('');
        } else {
          setError('Invalid template: missing schemaVersion, providerType, or actions');
          setUploadPreview(null);
        }
      } catch {
        setError('Invalid JSON file');
        setUploadPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleUploadApprove = async () => {
    if (!uploadIntegration) {
      setError('Please select an integration to assign these tools to');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const template = JSON.parse(uploadJson);
      const result = await apiClient.uploadProxyActionTemplate(uploadIntegration, template);
      setSuccessMsg(`Uploaded ${result.imported} tools (${result.skipped} skipped)`);
      setShowUpload(false);
      setUploadJson('');
      setUploadPreview(null);
      setUploadIntegration('');
      await loadData();
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="h-14 border-b border-gray-100 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold text-gray-900">
              {reviewTemplate ? 'Review Actions' : 'Import Proxy Tools'}
            </h3>
            {!reviewTemplate && (
              <span className="text-[10px] font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg">
                {templates.length} available
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {reviewTemplate && (
              <Button size="sm" variant="secondary" onClick={() => setReviewTemplate(null)}>
                Back
              </Button>
            )}
            {!reviewTemplate && (
              <Button size="sm" variant="secondary" onClick={() => { setShowUpload(!showUpload); setUploadPreview(null); setUploadJson(''); }}>
                <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Upload
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-2.5 rounded-xl text-sm border border-red-200 flex items-center justify-between">
              {error}
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl text-sm border border-emerald-200 flex items-center justify-between">
              {successMsg}
              <button onClick={() => setSuccessMsg('')} className="text-emerald-400 hover:text-emerald-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Review view: show all actions for approval */}
          {reviewTemplate ? (
            <div className="space-y-4">
              {/* Template header */}
              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="text-base font-semibold text-gray-900">{reviewTemplate.displayName}</h4>
                <p className="text-sm text-gray-500 mt-0.5">{reviewTemplate.description}</p>
                <p className="text-xs text-gray-400 mt-1">{reviewTemplate.actions.length} actions will be imported as proxy tools</p>
              </div>

              {/* Actions list */}
              <div>
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Actions to Import
                </h4>
                <div className="space-y-1.5">
                  {reviewTemplate.actions.map((a) => (
                    <div key={a.actionName} className="flex items-center gap-2 text-xs bg-white border border-gray-100 px-4 py-2.5 rounded-xl">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[a.method] || 'bg-gray-100'}`}>
                        {a.method}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TYPE_COLORS[a.actionType] || 'bg-gray-100'}`}>
                        {a.actionType}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-gray-700">{a.displayName}</span>
                        <span className="text-gray-400 ml-2">{a.description}</span>
                      </div>
                      <span className="font-mono text-gray-400 text-[11px] truncate max-w-[180px]">{a.endpoint}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Integration selector + approve */}
              <div className="border-t border-gray-200 pt-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Assign to Integration
                  </label>
                  <select
                    value={selectedIntegration}
                    onChange={(e) => setSelectedIntegration(e.target.value)}
                    className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:border-gray-300"
                  >
                    <option value="">Select an integration...</option>
                    {integrations.map((int) => (
                      <option key={int.id} value={int.providerConfigKey}>
                        {int.displayName} ({int.providerConfigKey})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    These proxy tools will be linked to the selected integration&apos;s provider config key.
                  </p>
                </div>

                <Button
                  onClick={handleApproveImport}
                  loading={importing}
                  className="w-full"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Approve & Import {reviewTemplate.actions.length} Tools
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Upload section */}
              {showUpload && (
                <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3 bg-gray-50">
                  <h4 className="text-sm font-semibold text-gray-700">Upload Custom Template</h4>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                  {uploadPreview && (
                    <>
                      <div className="text-xs text-gray-500">
                        {uploadPreview.actions.length} actions found in <span className="font-medium">{uploadPreview.displayName}</span>
                      </div>
                      <div className="space-y-1">
                        {uploadPreview.actions.map((a) => (
                          <div key={a.actionName} className="flex items-center gap-2 text-xs text-gray-600 bg-white px-3 py-1.5 rounded-lg">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[a.method] || 'bg-gray-100'}`}>
                              {a.method}
                            </span>
                            <span className="font-medium">{a.displayName}</span>
                            <span className="font-mono text-gray-400 truncate">{a.endpoint}</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Assign to Integration</label>
                        <select
                          value={uploadIntegration}
                          onChange={(e) => setUploadIntegration(e.target.value)}
                          className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                          <option value="">Select an integration...</option>
                          {integrations.map((int) => (
                            <option key={int.id} value={int.providerConfigKey}>
                              {int.displayName} ({int.providerConfigKey})
                            </option>
                          ))}
                        </select>
                      </div>
                      <Button size="sm" onClick={handleUploadApprove} loading={uploading}>
                        Approve & Import {uploadPreview.actions.length} Tools
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Template list */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">
                  No templates available. Upload a custom template to get started.
                </div>
              ) : (
                templates.map((t) => (
                  <div key={t.providerType} className="border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 transition-colors">
                    <div className="flex items-center justify-between px-5 py-4 bg-white">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-gray-900">{t.displayName}</h4>
                          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                            {t.providerType}
                          </span>
                          {t.isImported && (
                            <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-lg">
                              {t.importedActionCount}/{t.actionCount} imported
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                        <p className="text-xs text-gray-400 mt-1">{t.actionCount} actions</p>
                      </div>
                      <Button
                        size="sm"
                        variant={t.isImported && t.importedActionCount >= t.actionCount ? 'ghost' : 'secondary'}
                        onClick={() => handleSelectTemplate(t.providerType)}
                      >
                        {t.isImported && t.importedActionCount >= t.actionCount ? 'Review' : 'Import'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
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

/** Read-only slide-over for viewing action/sync tool details */
function ToolDetailViewer({ tool, onClose }: { tool: ToolEntry; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col border-l border-gray-200"
        style={{ animation: 'slideInRight 0.2s ease-out' }}
      >
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Basic Info
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <ReadOnlyField label="Display Name" value={tool.displayName} />
              <ReadOnlyField label="Action Name" value={tool.actionName} mono />
              <ReadOnlyField label="Provider Config Key" value={tool.providerConfigKey} mono />
              <ReadOnlyField label="Synced At" value={formatSyncTime(tool.syncedAt)} />
              {tool.description && (
                <div className="col-span-2">
                  <ReadOnlyField label="Description" value={tool.description} />
                </div>
              )}
            </div>
          </section>

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
