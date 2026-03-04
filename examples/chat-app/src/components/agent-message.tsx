'use client';

import type { ChatMessage, NextActionType, NextActionsData, PlanPreviewData } from '@/lib/types';
import { StepIndicator } from './step-indicator';
import { ConnectionCard } from './connection-card';
import { ToolResult } from './tool-result';
import { ThinkingIndicator } from './thinking-indicator';
import { PlanPreviewCard } from './plan-preview-card';
import { WorkflowResultCard } from './workflow-result-card';
import { NextActionsCard } from './next-actions-card';

interface AgentMessageProps {
  message: ChatMessage;
  onOAuthConnect: (provider: string, endUserId: string, nangoConnectionId: string) => void;
  onPlanConfirm?: (plan: PlanPreviewData) => void;
  onNextAction?: (actionType: NextActionType, data: NextActionsData) => void;
  onDismissNextActions?: () => void;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return 'less than a second';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function AgentMessage({ message, onOAuthConnect, onPlanConfirm, onNextAction, onDismissNextActions }: AgentMessageProps) {
  const isProcessing = message.status === 'processing';
  const isError = message.status === 'error';

  return (
    <div className="flex gap-3 animate-slide-up">
      {/* Agent avatar */}
      <div className="shrink-0 mt-0.5">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
          </svg>
        </div>
      </div>

      {/* Message content */}
      <div className="flex-1 min-w-0">
        {/* Elapsed time */}
        {message.elapsedMs !== undefined && (
          <p className="text-xs text-surface-400 mb-1">
            Worked for {formatElapsed(message.elapsedMs)}
          </p>
        )}

        {/* Main text */}
        <p className={`text-sm leading-relaxed ${isError ? 'text-red-600' : 'text-surface-800'}`}>
          {message.content}
        </p>

        {/* Steps */}
        {message.steps && message.steps.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {message.steps.map((step) => (
              <StepIndicator key={step.id} step={step} />
            ))}
          </div>
        )}

        {/* Plan preview card */}
        {message.planPreview && onPlanConfirm && (
          <PlanPreviewCard
            plan={message.planPreview}
            onConfirm={onPlanConfirm}
          />
        )}

        {/* Connection card */}
        {message.connectionCard && (
          <ConnectionCard card={message.connectionCard} onConnect={onOAuthConnect} />
        )}

        {/* Tool result */}
        {message.toolResult && <ToolResult data={message.toolResult} />}

        {/* Workflow results card */}
        {message.workflowResults && message.workflowResults.length > 0 && (
          <WorkflowResultCard results={message.workflowResults} />
        )}

        {/* Next actions card */}
        {message.nextActions && !message.nextActions.dismissed && onNextAction && onDismissNextActions && (
          <NextActionsCard
            data={message.nextActions}
            onAction={onNextAction}
            onDismiss={onDismissNextActions}
          />
        )}

        {/* Thinking indicator — only show when processing with no visible activity */}
        {isProcessing && (!message.steps || message.steps.length === 0) && !message.connectionCard && !message.planPreview && (
          <ThinkingIndicator />
        )}
      </div>
    </div>
  );
}
