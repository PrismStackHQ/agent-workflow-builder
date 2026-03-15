'use client';

import { useState } from 'react';
import type { ChatStep } from '@/lib/types';

/** Compact JSON display for arguments */
function InlineArguments({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );
  if (entries.length === 0) return null;

  return (
    <div className="mt-1.5 bg-surface-800 rounded-lg p-2.5 overflow-x-auto">
      <div className="text-[9px] uppercase tracking-wider text-surface-500 font-medium mb-1">Arguments</div>
      <pre className="text-[11px] leading-relaxed font-mono">
        {JSON.stringify(Object.fromEntries(entries), null, 2).split('\n').map((line, i) => (
          <span key={i} className="block">
            {line.split(/("[^"]*":?|[\d.]+|true|false|null)/).map((part, j) => {
              if (/^"[^"]*":$/.test(part)) return <span key={j} className="text-blue-400">{part}</span>;
              if (/^"[^"]*"$/.test(part)) return <span key={j} className="text-green-400">{part}</span>;
              if (/^\d+(\.\d+)?$/.test(part)) return <span key={j} className="text-amber-400">{part}</span>;
              if (part === 'true' || part === 'false' || part === 'null') return <span key={j} className="text-purple-400">{part}</span>;
              return <span key={j} className="text-surface-400">{part}</span>;
            })}
          </span>
        ))}
      </pre>
    </div>
  );
}

/** Compact JSON result display */
function InlineResult({ data }: { data: unknown; outputSummary?: string }) {
  if (data === null || data === undefined) return null;

  return (
    <div className="mt-1.5">
      <div className="bg-surface-800 rounded-lg p-2.5 overflow-x-auto max-h-60 overflow-y-auto">
        <div className="text-[9px] uppercase tracking-wider text-surface-500 font-medium mb-1">Output</div>
        <pre className="text-[11px] leading-relaxed font-mono">
          {JSON.stringify(data, null, 2).split('\n').map((line, i) => (
            <span key={i} className="block">
              {line.split(/("[^"]*":?|[\d.]+|true|false|null)/).map((part, j) => {
                if (/^"[^"]*":$/.test(part)) return <span key={j} className="text-blue-400">{part}</span>;
                if (/^"[^"]*"$/.test(part)) return <span key={j} className="text-green-400">{part}</span>;
                if (/^\d+(\.\d+)?$/.test(part)) return <span key={j} className="text-amber-400">{part}</span>;
                if (part === 'true' || part === 'false' || part === 'null') return <span key={j} className="text-purple-400">{part}</span>;
                return <span key={j} className="text-surface-400">{part}</span>;
              })}
            </span>
          ))}
        </pre>
      </div>
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
        {step.logoUrl ? (
          <img src={step.logoUrl} alt="" className="w-4 h-4 rounded shrink-0 object-contain" />
        ) : (
          <StepIcon icon={step.icon} isRunning={isRunning} isFailed={isFailed} />
        )}

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
