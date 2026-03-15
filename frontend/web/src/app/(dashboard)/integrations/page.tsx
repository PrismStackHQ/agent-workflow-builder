'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const INTEGRATION_PROVIDERS = [
  {
    value: 'NANGO',
    label: 'Nango',
    description: 'Open-source OAuth & token management',
    defaultUrl: 'https://api.nango.dev/integrations',
  },
  {
    value: 'UNIPILE',
    label: 'Unipile',
    description: 'Unified API for messaging & email',
    defaultUrl: 'https://api.unipile.com',
  },
  {
    value: 'MERGE',
    label: 'Merge',
    description: 'Unified API for integrations',
    defaultUrl: 'https://api.merge.dev',
  },
];

interface AvailableIntegration {
  id: string;
  providerConfigKey: string;
  displayName: string;
  logoUrl: string | null;
  integrationProvider: string;
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

interface TemplateRecommendation {
  providerType: string;
  providerConfigKey: string;
  displayName: string;
  actionCount: number;
  alreadyImported: boolean;
  importedActionCount: number;
}

export default function ConnectionsPage() {
  const [selectedProvider, setSelectedProvider] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [endpointApiKey, setEndpointApiKey] = useState('');
  const [integrations, setIntegrations] = useState<AvailableIntegration[]>([]);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isConfigSaved, setIsConfigSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<TemplateRecommendation[]>([]);
  const [importingKey, setImportingKey] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
    loadIntegrations();
    loadRecommendations();
  }, []);

  const loadConfig = async () => {
    try {
      const data = await apiClient.getConnectionConfig();
      if (data.integrationProvider) {
        setSelectedProvider(data.integrationProvider);
        setIsConfigSaved(true);
        setIsEditing(false);
      }
      if (data.connectionEndpointUrl) setEndpointUrl(data.connectionEndpointUrl);
      if (data.connectionEndpointApiKey) setEndpointApiKey(data.connectionEndpointApiKey);
      if (data.lastSyncedAt) setLastSyncedAt(data.lastSyncedAt);
    } catch {}
  };

  const loadIntegrations = async () => {
    try {
      const data = await apiClient.listAvailableIntegrations();
      if (Array.isArray(data)) setIntegrations(data);
    } catch {}
  };

  const loadRecommendations = async () => {
    try {
      const data = await apiClient.getProxyActionRecommendations();
      if (Array.isArray(data)) setRecommendations(data.filter((r: TemplateRecommendation) => !r.alreadyImported));
    } catch {}
  };

  const handleImportTemplate = async (rec: TemplateRecommendation) => {
    setImportingKey(rec.providerConfigKey);
    try {
      await apiClient.importProxyActionTemplate(rec.providerType, rec.providerConfigKey);
      setRecommendations((prev) => prev.filter((r) => r.providerConfigKey !== rec.providerConfigKey));
      setStatus(`Imported ${rec.actionCount} proxy actions for ${rec.displayName}`);
    } catch {
      setStatus(`Failed to import template for ${rec.displayName}`);
    } finally {
      setImportingKey(null);
    }
  };

  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider);
    const info = INTEGRATION_PROVIDERS.find((p) => p.value === provider);
    if (info) setEndpointUrl(info.defaultUrl);
  };

  const handleConfigureEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) {
      setStatus('Please select an integration provider');
      return;
    }
    setSaving(true);
    try {
      const result = await apiClient.configureConnectionEndpoint(selectedProvider, endpointUrl, endpointApiKey);
      if (result.integrations) {
        setIntegrations(result.integrations);
      }
      if (result.lastSyncedAt) {
        setLastSyncedAt(result.lastSyncedAt);
      }
      setIsConfigSaved(true);
      setIsEditing(false);
      setStatus('Integration provider configured successfully');
    } catch (err) {
      setStatus('Failed to configure endpoint');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await apiClient.syncIntegrations();
      if (result.integrations) {
        setIntegrations(result.integrations);
      }
      if (result.lastSyncedAt) {
        setLastSyncedAt(result.lastSyncedAt);
      }
      setStatus('Integrations synced successfully');
      loadRecommendations();
    } catch {
      setStatus('Failed to sync integrations');
    } finally {
      setSyncing(false);
    }
  };

  const isFormDisabled = isConfigSaved && !isEditing;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>

      {status && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          {status}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Integration Provider</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Select your OAuth token management service. Each workspace can have one provider.
              </p>
            </div>
            {isConfigSaved && !isEditing && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsEditing(true)}
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
                Edit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleConfigureEndpoint} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Provider</label>
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderChange(e.target.value)}
                disabled={isFormDisabled}
                className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:border-gray-300 disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
              >
                <option value="">Select a provider</option>
                {INTEGRATION_PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} — {p.description}
                  </option>
                ))}
              </select>
            </div>
            {selectedProvider && (
              <>
                <Input
                  label="Endpoint URL"
                  type="url"
                  placeholder="https://api.example.com"
                  value={endpointUrl}
                  onChange={(e) => setEndpointUrl(e.target.value)}
                  disabled={isFormDisabled}
                />
                <Input
                  label="API Key"
                  type="text"
                  placeholder="Your provider API key"
                  value={endpointApiKey}
                  onChange={(e) => setEndpointApiKey(e.target.value)}
                  disabled={isFormDisabled}
                />
                {(!isConfigSaved || isEditing) && (
                  <Button type="submit" loading={saving}>
                    Save Configuration
                  </Button>
                )}
              </>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Template recommendations banner */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-indigo-800">Proxy action templates available</p>
              <p className="text-xs text-indigo-600 mt-0.5">
                Import pre-built proxy actions for your connected integrations.
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {recommendations.map((rec) => (
                  <button
                    key={rec.providerConfigKey}
                    onClick={() => handleImportTemplate(rec)}
                    disabled={importingKey === rec.providerConfigKey}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-sm text-indigo-700 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                  >
                    {importingKey === rec.providerConfigKey ? (
                      <div className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    )}
                    {rec.displayName} ({rec.actionCount} actions)
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {(integrations.length > 0 || isConfigSaved) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Available Integrations</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Integrations fetched from your provider. These are available for use in your agents.
                </p>
              </div>
              {isConfigSaved && (
                <div className="flex items-center gap-3">
                  {lastSyncedAt && (
                    <span className="text-xs text-gray-400">
                      Last synced: {formatSyncTime(lastSyncedAt)}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleSync}
                    loading={syncing}
                  >
                    <svg className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
                    </svg>
                    Sync
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {integrations.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {integrations.map((integration) => (
                  <div
                    key={integration.id}
                    className="flex items-center gap-3 border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
                  >
                    {integration.logoUrl ? (
                      <img
                        src={integration.logoUrl}
                        alt={integration.displayName}
                        className="w-8 h-8 rounded-lg object-contain shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-gray-400">
                          {integration.displayName[0]?.toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{integration.displayName}</p>
                      <p className="text-xs text-gray-400 truncate">{integration.providerConfigKey}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                No integrations found. Click Sync to fetch from your provider.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
