'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { JsonFieldEditor } from '@/components/json-field-editor';

const ACTION_TYPES = ['SEARCH', 'LIST', 'GET', 'CREATE', 'UPDATE', 'DELETE', 'DOWNLOAD', 'SEND'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

type JsonField = 'paramsConfig' | 'bodyConfig' | 'headersConfig' | 'responseConfig' | 'postProcessConfig' | 'inputSchema' | 'outputSchema';

const JSON_FIELDS: { key: JsonField; label: string; description: string }[] = [
  { key: 'paramsConfig', label: 'Params Config', description: 'Query parameter mappings, defaults, and query builders' },
  { key: 'bodyConfig', label: 'Body Config', description: 'Request body mappings and templates' },
  { key: 'headersConfig', label: 'Headers Config', description: 'Static or dynamic HTTP headers' },
  { key: 'responseConfig', label: 'Response Config', description: 'Response mapping: rootPath, pick fields, flatten' },
  { key: 'postProcessConfig', label: 'Post-Process Config', description: 'Post-processing rules like enrichment' },
  { key: 'inputSchema', label: 'Input Schema', description: 'JSON Schema defining accepted input parameters' },
  { key: 'outputSchema', label: 'Output Schema', description: 'JSON Schema defining the output format' },
];

interface ProxyAction {
  id: string;
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
  transformerName: string | null;
  inputSchema: Record<string, unknown> | null;
  outputSchema: Record<string, unknown> | null;
  isEnabled: boolean;
  isDefault: boolean;
}

interface Props {
  action: ProxyAction;
  onSave: (id: string, data: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}

export function ProxyActionEditor({ action, onSave, onDelete, onClose }: Props) {
  const [form, setForm] = useState({
    displayName: action.displayName,
    description: action.description || '',
    actionType: action.actionType,
    method: action.method,
    endpoint: action.endpoint,
    transformerName: action.transformerName || '',
    providerConfigKey: action.providerConfigKey,
    actionName: action.actionName,
  });

  const [jsonFields, setJsonFields] = useState<Record<JsonField, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of JSON_FIELDS) {
      initial[f.key] = action[f.key] ? JSON.stringify(action[f.key], null, 2) : '';
    }
    return initial as Record<JsonField, string>;
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedField, setExpandedField] = useState<JsonField | null>(null);

  const handleFieldChange = useCallback(
    (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value })),
    [],
  );

  const handleJsonChange = useCallback(
    (field: JsonField, value: string) => setJsonFields((prev) => ({ ...prev, [field]: value })),
    [],
  );

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const data: Record<string, unknown> = {
        displayName: form.displayName,
        description: form.description || null,
        actionType: form.actionType,
        method: form.method,
        endpoint: form.endpoint,
        transformerName: form.transformerName || null,
        providerConfigKey: form.providerConfigKey,
        actionName: form.actionName,
      };

      for (const f of JSON_FIELDS) {
        const raw = jsonFields[f.key].trim();
        if (raw === '') {
          data[f.key] = null;
        } else {
          try {
            data[f.key] = JSON.parse(raw);
          } catch {
            setError(`Invalid JSON in ${f.label}`);
            setSaving(false);
            return;
          }
        }
      }

      await onSave(action.id, data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(action.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setDeleting(false);
    }
  };

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
            <h3 className="text-sm font-bold text-gray-900">Edit Proxy Action</h3>
            {action.isDefault && (
              <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-lg">
                Default
              </span>
            )}
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
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-2.5 rounded-xl text-sm border border-red-200 flex items-center justify-between">
              {error}
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Basic fields */}
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Basic Info
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <FieldInput label="Display Name" value={form.displayName} onChange={(v) => handleFieldChange('displayName', v)} />
              <FieldInput label="Action Name" value={form.actionName} onChange={(v) => handleFieldChange('actionName', v)} mono />
              <div className="col-span-2">
                <FieldInput label="Description" value={form.description} onChange={(v) => handleFieldChange('description', v)} />
              </div>
              <FieldInput label="Provider Config Key" value={form.providerConfigKey} onChange={(v) => handleFieldChange('providerConfigKey', v)} mono />
              <FieldInput label="Transformer" value={form.transformerName} onChange={(v) => handleFieldChange('transformerName', v)} mono placeholder="e.g. gmail_rfc2822_sender" />
            </div>
          </section>

          {/* HTTP Config */}
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              HTTP Config
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Action Type</label>
                <select
                  value={form.actionType}
                  onChange={(e) => handleFieldChange('actionType', e.target.value)}
                  className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:border-gray-300 transition-all"
                >
                  {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Method</label>
                <select
                  value={form.method}
                  onChange={(e) => handleFieldChange('method', e.target.value)}
                  className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:border-gray-300 transition-all"
                >
                  {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Endpoint</label>
                <input
                  type="text"
                  value={form.endpoint}
                  onChange={(e) => handleFieldChange('endpoint', e.target.value)}
                  className="w-full px-4 py-3 text-sm font-mono border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:border-gray-300 transition-all"
                />
              </div>
            </div>
          </section>

          {/* JSON Config Fields */}
          <section>
            <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Configuration (JSON)
            </h4>
            <div className="space-y-3">
              {JSON_FIELDS.map((field) => (
                <JsonFieldEditor
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  value={jsonFields[field.key]}
                  onChange={(v) => handleJsonChange(field.key, v)}
                  expanded={expandedField === field.key}
                  onToggleExpand={() => setExpandedField(expandedField === field.key ? null : field.key)}
                />
              ))}
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between shrink-0 bg-gray-50">
          <div>
            {!action.isDefault && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Are you sure?</span>
                  <Button size="sm" variant="danger" onClick={handleDelete} loading={deleting}>
                    Yes, delete
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                  Delete
                </Button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={handleSave} loading={saving}>Save Changes</Button>
          </div>
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

function FieldInput({
  label,
  value,
  onChange,
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:border-gray-300 transition-all ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}
