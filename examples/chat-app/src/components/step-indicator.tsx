'use client';

import { useState } from 'react';
import type { ChatStep } from '@/lib/types';

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Compact arguments display */
function InlineArguments({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 bg-surface-50 border border-surface-200 rounded-lg p-2.5 space-y-0.5">
      <div className="text-[9px] uppercase tracking-wider text-surface-400 font-medium mb-1">Arguments</div>
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-1.5 text-[11px] font-mono leading-relaxed">
          <span className="text-surface-500 shrink-0">{key}:</span>
          <span className="text-surface-700 break-all">
            {typeof value === 'string'
              ? value.length > 120 ? value.slice(0, 120) + '...' : value
              : JSON.stringify(value, null, 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compact result display */
function InlineResult({ data, outputSummary }: { data: unknown; outputSummary?: string }) {
  const [showJson, setShowJson] = useState(false);

  if (data === null || data === undefined) return null;

  // For simple output strings, just show inline
  if (typeof data === 'object' && 'output' in (data as Record<string, unknown>)) {
    const output = (data as Record<string, unknown>).output;
    if (typeof output === 'string' && output.length < 200) {
      return (
        <div className="mt-1.5 text-[11px] text-surface-500 bg-surface-50 rounded-lg px-2.5 py-2 border border-surface-200">
          {output}
        </div>
      );
    }
  }

  const isArray = Array.isArray(data);
  const isObject = typeof data === 'object' && !isArray;

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-wider text-surface-400 font-medium">
          Output {isArray ? `(${(data as unknown[]).length} items)` : ''}
        </span>
        <button
          onClick={() => setShowJson((p) => !p)}
          className="text-[10px] text-surface-400 hover:text-surface-600 transition-colors"
        >
          {showJson ? 'Compact' : 'JSON'}
        </button>
      </div>
      {showJson ? (
        <div className="bg-surface-50 border border-surface-200 rounded-lg p-2.5 overflow-x-auto max-h-48 overflow-y-auto">
          <pre className="text-[10px] leading-relaxed text-surface-600 font-mono">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      ) : isArray ? (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {(data as Record<string, unknown>[]).slice(0, 5).map((item, i) => (
            <div key={i} className="bg-surface-50 border border-surface-200 rounded-lg px-2.5 py-1.5 text-[11px]">
              {typeof item === 'object' && item !== null
                ? Object.entries(item).slice(0, 4).map(([k, v]) => (
                    <span key={k} className="mr-3">
                      <span className="text-surface-400">{k}: </span>
                      <span className="text-surface-700">{formatCellValue(v)}</span>
                    </span>
                  ))
                : formatCellValue(item)}
            </div>
          ))}
          {(data as unknown[]).length > 5 && (
            <div className="text-[10px] text-surface-400 pl-2">
              ...and {(data as unknown[]).length - 5} more
            </div>
          )}
        </div>
      ) : isObject ? (
        <div className="bg-surface-50 border border-surface-200 rounded-lg px-2.5 py-1.5 space-y-0.5">
          {Object.entries(data as Record<string, unknown>).slice(0, 8).map(([k, v]) => (
            <div key={k} className="flex gap-1.5 text-[11px]">
              <span className="text-surface-400 shrink-0">{k}:</span>
              <span className="text-surface-700 break-all">{formatCellValue(v)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-surface-500 bg-surface-50 rounded-lg px-2.5 py-2 border border-surface-200">
          {formatCellValue(data)}
        </div>
      )}
    </div>
  );
}

/** Icon for step type — minimal, muted style */
function StepIcon({ icon, isRunning, isFailed }: { icon?: string; isRunning: boolean; isFailed: boolean }) {
  if (isRunning) {
    return (
      <div className="w-3.5 h-3.5 border-[1.5px] border-surface-400 border-t-transparent rounded-full animate-spin shrink-0" />
    );
  }

  if (isFailed) {
    return (
      <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    );
  }

  // Search icon
  if (icon === 'search') {
    return (
      <svg className="w-3.5 h-3.5 text-surface-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    );
  }

  // Check icon
  if (icon === 'check') {
    return (
      <svg className="w-3.5 h-3.5 text-surface-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    );
  }

  // Play icon
  if (icon === 'play') {
    return (
      <svg className="w-3.5 h-3.5 text-surface-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
      </svg>
    );
  }

  // Link icon
  if (icon === 'link') {
    return (
      <svg className="w-3.5 h-3.5 text-surface-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.342" />
      </svg>
    );
  }

  // Default: list/menu icon (≡ style)
  return (
    <svg className="w-3.5 h-3.5 text-surface-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

export function StepIndicator({ step }: { step: ChatStep }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = step.status === 'running';
  const isFailed = step.status === 'failed';
  const hasDetails = !!(step.arguments && Object.keys(step.arguments).length > 0) || step.result !== undefined;

  // Always collapsed when running
  const canExpand = hasDetails && !isRunning;

  return (
    <div className="animate-slide-up">
      <button
        onClick={() => canExpand && setExpanded((p) => !p)}
        className={`group flex items-center gap-2 py-1 w-full text-left ${
          canExpand ? 'cursor-pointer hover:bg-surface-50 -mx-1.5 px-1.5 rounded-md' : 'cursor-default'
        }`}
      >
        <StepIcon icon={step.icon} isRunning={isRunning} isFailed={isFailed} />

        <span
          className={`text-[13px] leading-snug flex-1 min-w-0 ${
            isFailed ? 'text-red-500' : 'text-surface-400'
          }`}
        >
          {step.label}
          {step.outputSummary && !isRunning && (
            <span className="text-surface-400"> — {step.outputSummary}</span>
          )}
          {step.inputSummary && isRunning && (
            <span className="text-surface-300"> — {step.inputSummary}</span>
          )}
        </span>

        {canExpand && (
          <svg
            className={`w-3 h-3 text-surface-300 transition-transform shrink-0 ${
              expanded ? 'rotate-90' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        )}
      </button>

      {/* Expanded details — only when manually expanded, never during running */}
      {expanded && canExpand && (
        <div className="ml-5 pl-2.5 border-l border-surface-200 mb-1.5 mt-0.5">
          {step.arguments && Object.keys(step.arguments).length > 0 && (
            <InlineArguments args={step.arguments} />
          )}
          {step.result !== undefined && step.result !== null && (
            <InlineResult data={step.result} outputSummary={step.outputSummary} />
          )}
        </div>
      )}
    </div>
  );
}
