'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SettingsPage() {
  const [ragUrl, setRagUrl] = useState('');
  const [ragApiKey, setRagApiKey] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.configureRagEndpoint(ragUrl, ragApiKey);
      setStatus('RAG endpoint configured successfully');
    } catch (err) {
      setStatus('Failed to configure RAG endpoint');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

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
          <h2 className="text-base font-semibold text-gray-900">RAG Endpoint Configuration</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure your external RAG/search endpoint for enhanced agent capabilities.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="RAG Endpoint URL"
              type="url"
              placeholder="https://your-rag-api.com"
              value={ragUrl}
              onChange={(e) => setRagUrl(e.target.value)}
            />
            <Input
              label="RAG API Key"
              type="text"
              placeholder="API Key"
              value={ragApiKey}
              onChange={(e) => setRagApiKey(e.target.value)}
            />
            <Button type="submit" loading={saving}>
              Save RAG Config
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
