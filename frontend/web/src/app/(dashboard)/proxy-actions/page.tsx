'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

interface TemplateSummary {
  providerType: string;
  displayName: string;
  description: string;
  actionCount: number;
  isImported: boolean;
  importedActionCount: number;
}

interface TemplateFile {
  schemaVersion: string;
  providerType: string;
  displayName: string;
  description: string;
  actions: Array<{
    actionName: string;
    actionType: string;
    displayName: string;
    description: string;
    method: string;
    endpoint: string;
  }>;
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
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);

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
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowTemplateLibrary(true)} variant="secondary">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            Template Library
          </Button>
          <Button onClick={loadActions} variant="secondary">
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
            </svg>
            Refresh
          </Button>
        </div>
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
                Import from the template library or sync your tools to auto-generate proxy actions.
              </p>
              <Button onClick={() => setShowTemplateLibrary(true)} variant="secondary">
                Browse Template Library
              </Button>
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

      {/* Template Library slide-over */}
      {showTemplateLibrary && (
        <TemplateLibrary
          onClose={() => setShowTemplateLibrary(false)}
          onImported={loadActions}
        />
      )}
    </div>
  );
}

// ---- Template Library Slide-over ----

function TemplateLibrary({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<TemplateFile | null>(null);
  const [importingType, setImportingType] = useState<string | null>(null);
  const [importKey, setImportKey] = useState('');
  const [importResult, setImportResult] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadKey, setUploadKey] = useState('');
  const [uploadJson, setUploadJson] = useState('');
  const [uploadPreview, setUploadPreview] = useState<{ actions: Array<{ actionName: string; displayName: string; method: string; endpoint: string }> } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await apiClient.listProxyActionTemplates();
      if (Array.isArray(data)) setTemplates(data);
    } catch {
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (providerType: string) => {
    try {
      const data = await apiClient.getProxyActionTemplate(providerType);
      setPreviewTemplate(data);
    } catch {
      setError('Failed to load template preview');
    }
  };

  const handleImport = async (providerType: string) => {
    if (!importKey.trim()) {
      setError('Provider config key is required');
      return;
    }
    setImportingType(providerType);
    try {
      const result = await apiClient.importProxyActionTemplate(providerType, importKey.trim());
      setImportResult(`Imported ${result.imported} actions (${result.skipped} skipped)`);
      await loadTemplates();
      onImported();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to import');
    } finally {
      setImportingType(null);
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
          setError('Invalid template format: missing schemaVersion, providerType, or actions');
          setUploadPreview(null);
        }
      } catch {
        setError('Invalid JSON file');
        setUploadPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!uploadKey.trim()) {
      setError('Provider config key is required for upload');
      return;
    }
    setUploading(true);
    try {
      const template = JSON.parse(uploadJson);
      const result = await apiClient.uploadProxyActionTemplate(uploadKey.trim(), template);
      setImportResult(`Uploaded ${result.imported} actions (${result.skipped} skipped)`);
      setShowUpload(false);
      setUploadJson('');
      setUploadPreview(null);
      setUploadKey('');
      await loadTemplates();
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
            <h3 className="text-sm font-bold text-gray-900">Template Library</h3>
            <span className="text-[10px] font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg">
              {templates.length} templates
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowUpload(!showUpload)}>
              <svg className="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload
            </Button>
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

          {importResult && (
            <div className="bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-xl text-sm border border-emerald-200 flex items-center justify-between">
              {importResult}
              <button onClick={() => setImportResult('')} className="text-emerald-400 hover:text-emerald-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

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
                    {uploadPreview.actions.length} actions found
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">Provider Config Key</label>
                    <input
                      type="text"
                      value={uploadKey}
                      onChange={(e) => setUploadKey(e.target.value)}
                      placeholder="e.g., custom-api"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <Button size="sm" onClick={handleUpload} loading={uploading}>
                    Import {uploadPreview.actions.length} Actions
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
              <div key={t.providerType} className="border border-gray-200 rounded-xl overflow-hidden">
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
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => previewTemplate?.providerType === t.providerType ? setPreviewTemplate(null) : handlePreview(t.providerType)}
                    >
                      {previewTemplate?.providerType === t.providerType ? 'Hide' : 'Preview'}
                    </Button>
                  </div>
                </div>

                {/* Preview actions */}
                {previewTemplate?.providerType === t.providerType && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 space-y-2">
                    {previewTemplate.actions.map((a) => (
                      <div key={a.actionName} className="flex items-center gap-2 text-xs bg-white px-3 py-2 rounded-lg">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[a.method] || 'bg-gray-100'}`}>
                          {a.method}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${TYPE_COLORS[a.actionType] || 'bg-gray-100'}`}>
                          {a.actionType}
                        </span>
                        <span className="font-medium text-gray-700">{a.displayName}</span>
                        <span className="font-mono text-gray-400 truncate ml-auto">{a.endpoint}</span>
                      </div>
                    ))}

                    {/* Import controls */}
                    <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                      <input
                        type="text"
                        value={importKey}
                        onChange={(e) => setImportKey(e.target.value)}
                        placeholder="Provider config key (e.g., google-drive-4)"
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleImport(t.providerType)}
                        loading={importingType === t.providerType}
                      >
                        Import
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
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
