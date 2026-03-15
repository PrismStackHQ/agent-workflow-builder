'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

export function JsonFieldEditor({
  label,
  description,
  value,
  onChange,
  expanded,
  onToggleExpand,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasValue = value.trim().length > 0;

  useEffect(() => {
    if (expanded && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = Math.max(120, Math.min(el.scrollHeight, 400)) + 'px';
    }
  }, [expanded, value]);

  const handleChange = useCallback(
    (raw: string) => {
      onChange(raw);
      if (raw.trim() === '') {
        setError(null);
        return;
      }
      try {
        JSON.parse(raw);
        setError(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Invalid JSON');
      }
    },
    [onChange],
  );

  const handleFormat = useCallback(() => {
    if (!value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {}
  }, [value, onChange]);

  const handleMinify = useCallback(() => {
    if (!value.trim()) return;
    try {
      const parsed = JSON.parse(value);
      onChange(JSON.stringify(parsed));
      setError(null);
    } catch {}
  }, [value, onChange]);

  const handleClear = useCallback(() => {
    onChange('');
    setError(null);
  }, [onChange]);

  return (
    <div
      className={`border rounded-xl transition-all duration-200 ${
        error
          ? 'border-red-300 bg-red-50/30'
          : expanded
            ? 'border-indigo-200 bg-indigo-50/20 shadow-sm'
            : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <div>
            <span className="text-sm font-medium text-gray-800">{label}</span>
            {!expanded && (
              <span className="ml-2 text-xs text-gray-400">{description}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasValue && !error && (
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
          )}
          {hasValue && error && (
            <span className="w-2 h-2 rounded-full bg-red-400" />
          )}
          {!hasValue && (
            <span className="text-[10px] text-gray-300 uppercase">empty</span>
          )}
        </div>
      </button>

      {/* Editor */}
      {expanded && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500 mb-2">{description}</p>

          {/* Toolbar */}
          <div className="flex items-center gap-1 mb-2">
            <button
              onClick={handleFormat}
              disabled={!hasValue}
              className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
            >
              Format
            </button>
            <button
              onClick={handleMinify}
              disabled={!hasValue}
              className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-30"
            >
              Minify
            </button>
            <button
              onClick={handleClear}
              disabled={!hasValue}
              className="px-2.5 py-1 text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
            >
              Clear
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="{ }"
            spellCheck={false}
            className={`w-full px-4 py-3 text-sm font-mono leading-relaxed border rounded-xl resize-none focus:outline-none focus:ring-2 transition-all ${
              error
                ? 'border-red-300 focus:ring-red-300/20 bg-white'
                : 'border-gray-200 focus:ring-indigo-500/20 focus:border-indigo-500 bg-gray-50'
            }`}
            style={{ minHeight: '120px', tabSize: 2 }}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const textarea = e.currentTarget;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const newValue = value.substring(0, start) + '  ' + value.substring(end);
                handleChange(newValue);
                requestAnimationFrame(() => {
                  textarea.selectionStart = textarea.selectionEnd = start + 2;
                });
              }
            }}
          />

          {error && (
            <p className="mt-1.5 text-xs text-red-600 font-mono">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
