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
    // Too many columns — show as individual cards
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

  // Primitive or simple array → JSON view
  if (typeof data === 'string') {
    return <p className="text-sm text-surface-700">{data}</p>;
  }

  return <JsonView data={data} />;
}

export function WorkflowResultCard({ results }: { results: WorkflowResultItem[] }) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(() => {
    // Auto-expand the last step's results
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

            return (
              <div key={result.stepIndex}>
                {/* Step header (collapsible) */}
                <button
                  onClick={() => toggleStep(result.stepIndex)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-50 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-surface-700">
                      {formatStepName(result.stepName)}
                    </span>
                    {itemCount !== null && (
                      <span className="ml-2 text-xs text-surface-400">
                        ({itemCount} item{itemCount !== 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                  <svg
                    className={`w-4 h-4 text-surface-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {/* Expanded content */}
                {isExpanded && hasData && (
                  <div className="px-4 pb-4">
                    {/* View toggle */}
                    <div className="flex justify-end mb-2">
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

                {isExpanded && !hasData && (
                  <div className="px-4 pb-4">
                    <p className="text-xs text-surface-400 italic">No data returned</p>
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
