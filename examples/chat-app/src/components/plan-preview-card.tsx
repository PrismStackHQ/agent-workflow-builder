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

/** Check if a string value contains a {{step[N].result...}} expression */
function isExpression(val: string): boolean {
  return /\{\{step\[\d+\]\.result/.test(val);
}

/** Parse a step reference like {{step[0].result.id}} and return the step number */
function parseStepRef(val: string): number | null {
  const match = val.match(/\{\{step\[(\d+)\]/);
  return match ? parseInt(match[1], 10) : null;
}

/** Render a param value with expression syntax highlighting */
function ParamValue({ value }: { value: unknown }) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (typeof value !== 'string' || !isExpression(str)) {
    return <span>{str}</span>;
  }

  // Split and highlight {{...}} expressions
  const parts = str.split(/(\{\{[^}]+\}\})/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\{\{.+\}\}$/.test(part)) {
          const stepNum = parseStepRef(part);
          // Show a readable label for the expression
          const label = part
            .replace(/^\{\{/, '')
            .replace(/\}\}$/, '')
            .trim();
          return (
            <span
              key={i}
              className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-primary-50 text-primary-700 rounded border border-primary-200 text-[10px] font-medium whitespace-nowrap"
              title={part}
            >
              {stepNum !== null && (
                <span className="w-3.5 h-3.5 rounded-full bg-primary-200 text-primary-800 flex items-center justify-center text-[9px] font-bold shrink-0">
                  {stepNum + 1}
                </span>
              )}
              {label.replace(/^step\[\d+\]\.result\.?/, '').replace(/\s*\|\s*/g, ' | ') || 'result'}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** Data flow arrow between steps */
function DataFlowArrow() {
  return (
    <div className="flex justify-center py-0.5">
      <div className="flex flex-col items-center">
        <div className="w-px h-2 bg-primary-300" />
        <svg className="w-3 h-3 text-primary-400" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 9L2 5h8L6 9z" />
        </svg>
      </div>
    </div>
  );
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

  const triggerLabel = 'Run once now';

  // Check if any step references a previous step's result (data flow exists)
  const hasDataFlow = plan.steps.some((step) =>
    Object.values(step.params).some(
      (v) => typeof v === 'string' && isExpression(v),
    ),
  );

  return (
    <div className="animate-slide-up my-3">
      <div className="bg-surface-50 rounded-xl border border-surface-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-surface-900">{plan.name}</p>
            <p className="text-xs text-surface-500 mt-0.5">
              {triggerLabel}
              {hasDataFlow && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary-600">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  Data flows between steps
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-primary-50 text-primary-700 border border-primary-200">
              {plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="px-4 py-3">
          {plan.steps.map((step, i) => (
            <div key={i}>
              {/* Data flow arrow between steps */}
              {i > 0 && <DataFlowArrow />}

              <div className="flex items-start gap-3 bg-white rounded-lg border border-surface-200 p-3">
                <div className="shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-800">
                    {step.description || step.action}
                  </p>
                  <p className="text-xs text-surface-500 mt-0.5">
                    <span className="font-mono text-surface-400">{step.action}</span>
                    {' '}via {providerDisplayName(step.connector)}
                  </p>
                  {step.params && Object.keys(step.params).length > 0 && (
                    <div className="mt-1.5 text-xs text-surface-500 bg-surface-50 rounded px-2 py-1.5 font-mono space-y-0.5">
                      {Object.entries(step.params)
                        .slice(0, 4)
                        .map(([key, val]) => (
                          <div key={key} className="flex items-center gap-1 overflow-hidden">
                            <span className="text-surface-400 shrink-0">{key}:</span>
                            <span className="truncate">
                              <ParamValue value={val} />
                            </span>
                          </div>
                        ))}
                      {Object.keys(step.params).length > 4 && (
                        <div className="text-surface-300">
                          +{Object.keys(step.params).length - 4} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
