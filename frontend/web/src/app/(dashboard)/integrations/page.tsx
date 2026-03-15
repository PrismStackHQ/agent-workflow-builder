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

  useEffect(() => {
    loadConfig();
    loadIntegrations();
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
