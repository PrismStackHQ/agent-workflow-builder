'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProtectedRoute } from '@/components/protected-route';

function ConnectionsContent() {
  const [endpointUrl, setEndpointUrl] = useState('');
  const [endpointApiKey, setEndpointApiKey] = useState('');
  const [connections, setConnections] = useState<any[]>([]);
  const [newProvider, setNewProvider] = useState('');
  const [newRefId, setNewRefId] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const data = await apiClient.listConnections();
      if (Array.isArray(data)) setConnections(data);
    } catch {
      // not configured yet
    }
  };

  const handleConfigureEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.configureConnectionEndpoint(endpointUrl, endpointApiKey);
      setStatus('Connection endpoint configured successfully');
    } catch (err) {
      setStatus('Failed to configure endpoint');
    }
  };

  const handleAddConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.createConnection(newProvider, newRefId);
      setNewProvider('');
      setNewRefId('');
      loadConnections();
      setStatus('Connection created');
    } catch (err) {
      setStatus('Failed to create connection');
    }
  };

  const handleMarkReady = async (refId: string) => {
    try {
      await apiClient.markConnectionReady(refId);
      loadConnections();
      setStatus('Connection marked as ready');
    } catch (err) {
      setStatus('Failed to update connection');
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Connection Management</h1>

      {status && (
        <div className="bg-blue-50 text-blue-700 p-3 rounded mb-4">{status}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Connection Endpoint Configuration</h2>
        <p className="text-gray-600 text-sm mb-4">
          Configure your external connection endpoint where OAuth tokens are managed.
        </p>
        <form onSubmit={handleConfigureEndpoint} className="space-y-3">
          <input
            type="url"
            placeholder="Connection Endpoint URL (e.g., https://your-api.com)"
            value={endpointUrl}
            onChange={(e) => setEndpointUrl(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
          <input
            type="text"
            placeholder="Endpoint API Key"
            value={endpointApiKey}
            onChange={(e) => setEndpointApiKey(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Save Endpoint
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Add Connection Reference</h2>
        <form onSubmit={handleAddConnection} className="flex gap-3">
          <select
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2"
          >
            <option value="">Select Provider</option>
            <option value="gmail">Gmail</option>
            <option value="gdrive">Google Drive</option>
            <option value="slack">Slack</option>
            <option value="notion">Notion</option>
          </select>
          <input
            type="text"
            placeholder="External Reference ID"
            value={newRefId}
            onChange={(e) => setNewRefId(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-3 py-2"
          />
          <button
            type="submit"
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Add
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Connection References</h2>
        {connections.length === 0 ? (
          <p className="text-gray-500">No connections configured yet.</p>
        ) : (
          <div className="space-y-3">
            {connections.map((conn) => (
              <div key={conn.id} className="flex items-center justify-between border border-gray-200 rounded p-3">
                <div>
                  <span className="font-medium capitalize">{conn.provider}</span>
                  <span className="text-gray-500 ml-2 text-sm">{conn.externalRefId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      conn.status === 'READY'
                        ? 'bg-green-100 text-green-700'
                        : conn.status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {conn.status}
                  </span>
                  {conn.status !== 'READY' && (
                    <button
                      onClick={() => handleMarkReady(conn.id)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      Mark Ready
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConnectionsPage() {
  return (
    <ProtectedRoute>
      <ConnectionsContent />
    </ProtectedRoute>
  );
}
