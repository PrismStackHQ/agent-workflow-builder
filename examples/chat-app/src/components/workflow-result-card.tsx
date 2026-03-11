'use client';

import { useState } from 'react';
import type { WorkflowResultItem } from '@/lib/types';

function formatStepName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isArrayOfObjects(data: unknown): data is Record<string, unknown>[] {
  return Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null;
}

function getColumns(items: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const item of items.slice(0, 10)) {
    for (const key of Object.keys(item)) {
      keys.add(key);
    }
  }
  return Array.from(keys);
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function formatColumnHeader(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Status icon for step header */
function StepStatusIcon({ status }: { status?: string }) {
  if (status === 'failed') {
    return (
      <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <svg className="w-3 h-3 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
        <div className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
      <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </div>
  );
}

/** Renders arguments in a dark terminal-style card */
function ArgumentsCard({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );
  if (entries.length === 0) return null;

  return (
    <div className="bg-surface-800 rounded-lg p-3 space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-surface-500 font-medium mb-1.5">Arguments</div>
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 text-xs font-mono">
          <span className="text-blue-400 shrink-0">{key}:</span>
          <span className="text-green-400 break-all">
            {typeof value === 'string'
              ? value
              : JSON.stringify(value, null, 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Renders a single result item as a key-value card */
function ObjectCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="bg-surface-50 border border-surface-200 rounded-lg p-3 space-y-1.5">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex gap-2 text-xs">
          <span className="text-surface-400 shrink-0 min-w-[80px]">
            {formatColumnHeader(key)}
          </span>
          <span className="text-surface-700 break-all">
            {formatCellValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Renders an array of objects as a table */
function ResultTable({ items, columns }: { items: Record<string, unknown>[]; columns: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-surface-200">
            {columns.map((col) => (
              <th
                key={col}
                className="text-left py-2 px-3 text-surface-500 font-medium whitespace-nowrap"
              >
                {formatColumnHeader(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-surface-100 last:border-0 hover:bg-surface-50 transition-colors">
              {columns.map((col) => (
                <td key={col} className="py-2 px-3 text-surface-700 max-w-[200px] truncate">
                  {formatCellValue(item[col])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders raw JSON with syntax highlighting */
function JsonView({ data }: { data: unknown }) {
  return (
    <div className="bg-surface-800 rounded-lg p-4 overflow-x-auto">
      <pre className="text-xs leading-relaxed">
        <code>
          {JSON.stringify(data, null, 2).split('\n').map((line: string, i: number) => (
            <span key={i} className="block">
              {line.split(/("[^"]*":?|[\d.]+|true|false|null)/).map((part: string, j: number) => {
                if (/^"[^"]*":$/.test(part)) {
                  return <span key={j} className="text-blue-400">{part}</span>;
                }
                if (/^"[^"]*"$/.test(part)) {
                  return <span key={j} className="text-green-400">{part}</span>;
                }
                if (/^\d+(\.\d+)?$/.test(part)) {
                  return <span key={j} className="text-amber-400">{part}</span>;
                }
                if (part === 'true' || part === 'false' || part === 'null') {
                  return <span key={j} className="text-purple-400">{part}</span>;
                }
                return <span key={j} className="text-surface-300">{part}</span>;
              })}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function ResultContent({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <p className="text-xs text-surface-400 italic">No data returned</p>;
  }

  // Array of objects → table view
  if (isArrayOfObjects(data)) {
    const columns = getColumns(data);
    if (columns.length <= 6) {
      return <ResultTable items={data} columns={columns} />;
    }
    return (
      <div className="space-y-2">
        {data.map((item, i) => (
          <ObjectCard key={i} data={item} />
        ))}
      </div>
    );
  }

  // Single object → key-value card
  if (typeof data === 'object' && !Array.isArray(data)) {
    return <ObjectCard data={data as Record<string, unknown>} />;
  }

  if (typeof data === 'string') {
    return <p className="text-sm text-surface-700">{data}</p>;
  }

  return <JsonView data={data} />;
}

export function WorkflowResultCard({ results }: { results: WorkflowResultItem[] }) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(() => {
    if (results.length > 0) {
      return new Set([results[results.length - 1].stepIndex]);
    }
    return new Set();
  });

  const [viewMode, setViewMode] = useState<Record<number, 'smart' | 'json'>>({});

  const toggleStep = (stepIndex: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepIndex)) {
        next.delete(stepIndex);
      } else {
        next.add(stepIndex);
      }
      return next;
    });
  };

  const toggleViewMode = (stepIndex: number) => {
    setViewMode((prev) => ({
      ...prev,
      [stepIndex]: prev[stepIndex] === 'json' ? 'smart' : 'json',
    }));
  };

  if (results.length === 0) return null;

  return (
    <div className="mt-3 animate-slide-up">
      <div className="border border-surface-200 rounded-xl overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-surface-50 border-b border-surface-200">
          <div className="w-5 h-5 rounded bg-primary-100 flex items-center justify-center">
            <svg className="w-3 h-3 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-surface-700">
            Workflow Results
          </span>
          <span className="text-xs text-surface-400 ml-auto">
            {results.length} step{results.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Result steps */}
        <div className="divide-y divide-surface-100">
          {results.map((result) => {
            const isExpanded = expandedSteps.has(result.stepIndex);
            const mode = viewMode[result.stepIndex] || 'smart';
            const hasData = result.data !== null && result.data !== undefined;
            const itemCount = Array.isArray(result.data) ? result.data.length : null;
            const hasArgs = result.arguments && Object.keys(result.arguments).length > 0;

            return (
              <div key={result.stepIndex}>
                {/* Step header — shows tool name + input/output summary */}
                <button
                  onClick={() => toggleStep(result.stepIndex)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-50 transition-colors"
                >
                  <StepStatusIcon status={result.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-surface-700 font-medium">
                      {result.description || formatStepName(result.stepName)}
                    </div>
                    {/* Input → Output summary line */}
                    {(result.inputSummary || result.outputSummary) && (
                      <div className="text-xs text-surface-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {result.inputSummary && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3 text-surface-300 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                            </svg>
                            {result.inputSummary}
                          </span>
                        )}
                        {result.inputSummary && result.outputSummary && (
                          <span className="text-surface-300">→</span>
                        )}
                        {result.outputSummary && (
                          <span className="text-surface-500">{result.outputSummary}</span>
                        )}
                      </div>
                    )}
                    {!result.inputSummary && !result.outputSummary && itemCount !== null && (
                      <span className="text-xs text-surface-400">
                        ({itemCount} item{itemCount !== 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                  <svg
                    className={`w-4 h-4 text-surface-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Expanded: Arguments + Output (Claude Code style) */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Arguments block */}
                    {hasArgs && <ArgumentsCard args={result.arguments!} />}

                    {/* Output block */}
                    {hasData && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[10px] uppercase tracking-wider text-surface-400 font-medium">
                            Output
                          </div>
                          <button
                            onClick={() => toggleViewMode(result.stepIndex)}
                            className="text-xs text-surface-400 hover:text-surface-600 transition-colors flex items-center gap-1"
                          >
                            {mode === 'smart' ? (
                              <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                                </svg>
                                JSON
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M21.375 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125" />
                                </svg>
                                Table
                              </>
                            )}
                          </button>
                        </div>

                        {mode === 'json' ? (
                          <JsonView data={result.data} />
                        ) : (
                          <ResultContent data={result.data} />
                        )}
                      </div>
                    )}

                    {!hasData && !hasArgs && (
                      <p className="text-xs text-surface-400 italic">No data returned</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
