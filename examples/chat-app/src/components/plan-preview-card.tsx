'use client';

import { useState } from 'react';
import type { PlanPreviewData } from '@/lib/types';

/** Fallback display name when server doesn't provide one */
function fallbackDisplayName(provider: string): string {
  return provider.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a string value contains a {{...}} expression */
function isExpression(val: string): boolean {
  return /\{\{(?:step\[\d+\]\.result|parent\[\d+\]\.result|item|loop\.index)/.test(val);
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
  const [showInstructions, setShowInstructions] = useState(false);

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

              <div className={`flex items-start gap-3 bg-white rounded-lg border p-3 ${
                step.action === 'invoke_sub_agent' ? 'border-violet-200' :
                step.action === 'for_each' ? 'border-teal-200' :
                step.action === 'llm_transform' ? 'border-amber-200' :
                'border-surface-200'
              }`}>
                <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.action === 'invoke_sub_agent' ? 'bg-violet-100 text-violet-700' :
                  step.action === 'for_each' ? 'bg-teal-100 text-teal-700' :
                  step.action === 'llm_transform' ? 'bg-amber-100 text-amber-700' :
                  'bg-primary-100 text-primary-700'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  {step.action === 'invoke_sub_agent' ? (
                    <>
                      <p className="text-sm font-medium text-surface-800">
                        {step.subAgentName || step.description || 'Sub-agent'}
                      </p>
                      <p className="text-xs text-violet-600 mt-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                        </svg>
                        Sub-agent workflow
                      </p>
                      {step.description && step.subAgentName && (
                        <p className="text-xs text-surface-500 mt-0.5">{step.description}</p>
                      )}
                    </>
                  ) : step.action === 'for_each' ? (
                    <>
                      <p className="text-sm font-medium text-surface-800">
                        {step.description || 'For each item'}
                      </p>
                      <p className="text-xs text-teal-600 mt-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
                        </svg>
                        Loop — processes each item individually
                        {step.params?.onError === 'skip' && (
                          <span className="ml-1 px-1.5 py-0.5 bg-teal-50 text-teal-600 rounded text-[10px] font-medium border border-teal-200">skip on error</span>
                        )}
                      </p>
                      {/* Nested steps */}
                      {step.steps && step.steps.length > 0 && (
                        <div className="mt-2 ml-1 pl-3 border-l-2 border-teal-200 space-y-1.5">
                          {step.steps.map((innerStep, j) => (
                            <div key={j} className="flex items-start gap-2 bg-teal-50/50 rounded p-2 border border-teal-100">
                              <div className="shrink-0 w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-[9px] font-bold mt-0.5">
                                {j + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-surface-700">
                                  {innerStep.description || innerStep.action}
                                </p>
                                <p className="text-[10px] text-surface-400 mt-0.5">
                                  <span className="font-mono">{innerStep.action}</span>
                                  {innerStep.connector && <> via {plan.connectorDisplayNames?.[innerStep.connector] || fallbackDisplayName(innerStep.connector)}</>}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : step.action === 'llm_transform' ? (
                    <>
                      <p className="text-sm font-medium text-surface-800">
                        {step.description || 'AI data extraction'}
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                        AI-powered transformation
                        {step.params?.outputSchema && (
                          <span className="ml-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px] font-medium border border-amber-200">structured output</span>
                        )}
                      </p>
                      {step.params?.prompt && (
                        <div className="mt-1.5 text-xs text-surface-500 bg-amber-50/50 rounded px-2 py-1.5 border border-amber-100">
                          <span className="text-surface-400">prompt:</span>{' '}
                          <span className="truncate">
                            <ParamValue value={String(step.params.prompt).substring(0, 120) + (String(step.params.prompt).length > 120 ? '...' : '')} />
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-surface-800">
                        {step.description || step.action}
                      </p>
                      <p className="text-xs text-surface-500 mt-0.5">
                        <span className="font-mono text-surface-400">{step.action}</span>
                        {' '}via {plan.connectorDisplayNames?.[step.connector] || fallbackDisplayName(step.connector)}
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
                    </>
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
                  {plan.connectorDisplayNames?.[connector] || fallbackDisplayName(connector)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Detailed Instructions (collapsible) */}
        {plan.instructions && (
          <div className="px-4 py-2 border-t border-surface-100">
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="text-xs text-primary-600 font-medium hover:text-primary-700 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              Detailed instructions
              <svg
                className={`w-3 h-3 transition-transform ${showInstructions ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showInstructions && (
              <div className="mt-2 bg-white rounded-lg border border-surface-200 p-3 max-h-80 overflow-y-auto chat-scroll">
                <pre className="whitespace-pre-wrap text-xs text-surface-600 leading-relaxed font-sans">
                  {plan.instructions}
                </pre>
              </div>
            )}
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
