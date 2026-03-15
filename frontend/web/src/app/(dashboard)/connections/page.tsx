'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ConnectionRef {
  id: string;
  providerConfigKey: string;
  externalRefId: string;
  connectionId: string | null;
  status: 'PENDING' | 'OAUTH_REQUIRED' | 'READY' | 'FAILED';
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  READY: { bg: 'bg-green-50', text: 'text-green-700', label: 'Ready' },
  PENDING: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Pending' },
  OAUTH_REQUIRED: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'OAuth Required' },
  FAILED: { bg: 'bg-red-50', text: 'text-red-700', label: 'Failed' },
};

function formatTime(dateStr: string): string {
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
  const [connections, setConnections] = useState<ConnectionRef[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    syncFromProvider(true);
  }, []);

  const syncFromProvider = async (isInitial = false) => {
    if (!isInitial) setSyncing(true);
    setStatus('');
    try {
      const result = await apiClient.syncConnections();
      if (result.ok && result.connections) {
        setConnections(result.connections);
        if (!isInitial) {
          setStatus(`Synced ${result.syncedCount} connection${result.syncedCount !== 1 ? 's' : ''} from provider`);
        }
      } else if (result.error && result.error !== 'No integration provider configured') {
        setStatus(result.error);
      } else {
        // No provider configured — fall back to showing DB records
        const data = await apiClient.listConnections();
        if (Array.isArray(data)) setConnections(data);
      }
    } catch {
      // Fall back to DB if sync fails
      try {
        const data = await apiClient.listConnections();
        if (Array.isArray(data)) setConnections(data);
      } catch {
        setStatus('Failed to load connections');
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Connections</h1>

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
              <h2 className="text-base font-semibold text-gray-900">End-User Connections</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Connections synced from your integration provider. Each maps an end-user to a provider account.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => syncFromProvider()}
              loading={syncing}
            >
              <svg className={`w-4 h-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
              </svg>
              Sync
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-gray-400 text-center py-8">Loading connections...</div>
          ) : connections.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left font-medium text-gray-500 pb-3 pr-4">Provider</th>
                    <th className="text-left font-medium text-gray-500 pb-3 pr-4">Connection ID</th>
                    <th className="text-left font-medium text-gray-500 pb-3 pr-4">End User</th>
                    <th className="text-left font-medium text-gray-500 pb-3 pr-4">Status</th>
                    <th className="text-left font-medium text-gray-500 pb-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {connections.map((conn) => {
                    const statusStyle = STATUS_STYLES[conn.status] || STATUS_STYLES.PENDING;
                    return (
                      <tr key={conn.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 pr-4">
                          <span className="inline-flex items-center gap-1.5 font-medium text-gray-900">
                            {conn.providerConfigKey}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                            {conn.connectionId || '—'}
                          </code>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-gray-600">{conn.externalRefId}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                            {statusStyle.label}
                          </span>
                        </td>
                        <td className="py-3 text-gray-400 text-xs">
                          {formatTime(conn.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8">
              <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
              <p className="text-sm text-gray-400">
                No connections found. Click Sync to fetch from your integration provider.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
