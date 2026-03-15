'use client';

import { useState } from 'react';
import type { ToolResultData } from '@/lib/types';

export function ToolResult({ data }: { data: ToolResultData }) {
  const [expanded, setExpanded] = useState(true);
  const isRunning = data.status === 'running';

  const statusIcon = isRunning ? (
    <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
  ) : data.status === 'failed' ? (
    <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ) : (
    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );

  const formattedName = data.actionName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="animate-slide-up my-3">
      {/* Step header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded bg-primary-50 flex items-center justify-center">
          <svg className="w-3 h-3 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>
        <span className="text-sm text-surface-600">{formattedName}</span>
        {statusIcon}
      </div>

      {/* Arguments card */}
      {data.arguments ? (
        <div className="bg-surface-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
          >
            <span className="text-xs font-medium text-surface-400">Arguments</span>
            <svg
              className={`w-3.5 h-3.5 text-surface-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {expanded && (
            <div className="px-4 pb-4">
              <pre className="text-xs leading-relaxed">
                <code>
                  {JSON.stringify(data.arguments, null, 2).split('\n').map((line: string, i: number) => (
                    <span key={i} className="block">
                      {line.split(/("[^"]*":?|[\d.]+|true|false|null)/).map((part: string, j: number) => {
                        if (/^"[^"]*":$/.test(part)) {
                          return <span key={j} className="text-blue-400">{part}</span>;
                        }
                        if (/^"[^"]*"$/.test(part)) {
                          return <span key={j} className="text-green-400">{part}</span>;
                        }
                        if (/^\d+$/.test(part)) {
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
          )}
        </div>
      ) : null}

      {/* Result */}
      {data.result ? (
        <div className="mt-2 bg-surface-50 border border-surface-200 rounded-lg p-3">
          <p className="text-xs font-medium text-surface-500 mb-1">Result</p>
          <pre className="text-xs text-surface-700 whitespace-pre-wrap">
            {typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
