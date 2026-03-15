'use client';

import { useState } from 'react';
import type { NextActionsData, NextActionType } from '@/lib/types';

interface NextActionsCardProps {
  data: NextActionsData;
  onAction: (actionType: NextActionType, data: NextActionsData) => void;
  onDismiss: () => void;
}

const actions: { type: NextActionType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    type: 'schedule',
    label: 'Schedule this workflow',
    description: 'Run this workflow on a recurring schedule',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    type: 'actions_on_data',
    label: 'Take actions on this data',
    description: 'Download, summarize, update, or send based on the results',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    type: 'save',
    label: 'Save this workflow',
    description: 'Save for later use without scheduling',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
      </svg>
    ),
  },
];

export function NextActionsCard({ data, onAction, onDismiss }: NextActionsCardProps) {
  const [selectedActions, setSelectedActions] = useState<Set<NextActionType>>(new Set());

  if (data.dismissed) return null;

  const handleToggle = (type: NextActionType) => {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const handleActionClick = (type: NextActionType) => {
    onAction(type, data);
  };

  return (
    <div className="mt-3 animate-slide-up">
      <div className="border border-surface-200 rounded-xl overflow-hidden bg-white">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface-50 border-b border-surface-200">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-primary-100 flex items-center justify-center">
              <svg className="w-3 h-3 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <span className="text-sm font-medium text-surface-700">What would you like to do next?</span>
          </div>
          <button
            onClick={onDismiss}
            className="text-surface-400 hover:text-surface-600 transition-colors p-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Action buttons */}
        <div className="p-3 space-y-2">
          {actions.map((action) => (
            <button
              key={action.type}
              onClick={() => handleActionClick(action.type)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-surface-200 hover:border-primary-300 hover:bg-primary-50 transition-all text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-surface-100 group-hover:bg-primary-100 flex items-center justify-center text-surface-500 group-hover:text-primary-600 transition-colors shrink-0">
                {action.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-surface-700 group-hover:text-primary-700 transition-colors">
                  {action.label}
                </p>
                <p className="text-xs text-surface-400 mt-0.5">
                  {action.description}
                </p>
              </div>
              <svg className="w-4 h-4 text-surface-300 group-hover:text-primary-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
