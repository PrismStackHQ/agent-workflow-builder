'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { ProtectedRoute } from '@/components/protected-route';

function SettingsContent() {
  const [ragUrl, setRagUrl] = useState('');
  const [ragApiKey, setRagApiKey] = useState('');
  const [status, setStatus] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.configureRagEndpoint(ragUrl, ragApiKey);
      setStatus('RAG endpoint configured successfully');
    } catch (err) {
      setStatus('Failed to configure RAG endpoint');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      {status && (
        <div className="bg-blue-50 text-blue-700 p-3 rounded mb-4">{status}</div>
      )}

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">RAG Endpoint Configuration</h2>
        <p className="text-gray-600 text-sm mb-4">
          Configure your external RAG/search endpoint for enhanced agent capabilities.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="url"
            placeholder="RAG Endpoint URL"
            value={ragUrl}
            onChange={(e) => setRagUrl(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
          <input
            type="text"
            placeholder="RAG API Key"
            value={ragApiKey}
            onChange={(e) => setRagApiKey(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Save RAG Config
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  );
}
