'use client';

import { useState } from 'react';
import type { PlanPreviewData } from '@/lib/types';

function providerDisplayName(provider: string): string {
  const names: Record<string, string> = {
    gmail: 'Gmail',
    gdrive: 'Google Drive',
    'google-drive': 'Google Drive',
    'google-mail': 'Google Mail',
    'google-calendar': 'Google Calendar',
    slack: 'Slack',
    notion: 'Notion',
    google_sheets: 'Google Sheets',
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

interface PlanPreviewCardProps {
  plan: PlanPreviewData;
  onConfirm: (plan: PlanPreviewData) => void;
}

export function PlanPreviewCard({ plan, onConfirm }: PlanPreviewCardProps) {
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = () => {
    setConfirmed(true);
    onConfirm(plan);
  };

  const triggerLabel =
    plan.triggerType === 'cron' && plan.schedule
      ? `Scheduled: ${plan.schedule}`
      : plan.triggerType === 'event'
        ? 'Trigger: On event'
        : 'Trigger: Manual';

  return (
    <div className="animate-slide-up my-3">
      <div className="bg-surface-50 rounded-xl border border-surface-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-surface-900">{plan.name}</p>
            <p className="text-xs text-surface-500 mt-0.5">{triggerLabel}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-primary-50 text-primary-700 border border-primary-200">
              {plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="px-4 py-3 space-y-2">
          {plan.steps.map((step, i) => (
            <div
              key={i}
              className="flex items-start gap-3 bg-white rounded-lg border border-surface-200 p-3"
            >
              <div className="shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-800">{step.action}</p>
                <p className="text-xs text-surface-500 mt-0.5">
                  via {providerDisplayName(step.connector)}
                </p>
                {step.params && Object.keys(step.params).length > 0 && (
                  <div className="mt-1.5 text-xs text-surface-400 bg-surface-50 rounded px-2 py-1 font-mono">
                    {Object.entries(step.params)
                      .slice(0, 3)
                      .map(([key, val]) => (
                        <div key={key} className="truncate">
                          {key}: {typeof val === 'string' ? val : JSON.stringify(val)}
                        </div>
                      ))}
                    {Object.keys(step.params).length > 3 && (
                      <div className="text-surface-300">
                        +{Object.keys(step.params).length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Connectors */}
        {plan.connectors.length > 0 && (
          <div className="px-4 py-2 border-t border-surface-100">
            <p className="text-xs text-surface-500 font-medium mb-1.5">Connections:</p>
            <div className="flex flex-wrap gap-1.5">
              {plan.connectors.map((connector) => (
                <span
                  key={connector}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border bg-green-50 text-green-700 border-green-200"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  {providerDisplayName(connector)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-3 border-t border-surface-100 flex items-center justify-between">
          <p className="text-xs text-surface-400">
            {confirmed
              ? 'Plan confirmed — creating agent and running...'
              : 'Review the steps above and confirm to create and run the agent.'}
          </p>
          <button
            onClick={handleConfirm}
            disabled={confirmed}
            className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmed ? 'Confirmed' : 'Confirm & Run'}
          </button>
        </div>
      </div>
    </div>
  );
}
