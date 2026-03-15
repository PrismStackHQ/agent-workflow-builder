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

/** Render inline bold markdown */
function InlineBold({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** Render text with **bold** and bullet point markdown support */
function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  const hasBullets = lines.some((l) => /^\s*[-•*]\s/.test(l));

  if (!hasBullets) {
    return (
      <span className={className}>
        <InlineBold text={text} />
      </span>
    );
  }

  // Group lines into paragraphs and bullet lists
  const elements: { type: 'text' | 'bullet'; content: string }[] = [];
  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-•*]\s+(.*)/);
    if (bulletMatch) {
      elements.push({ type: 'bullet', content: bulletMatch[1] });
    } else if (line.trim()) {
      elements.push({ type: 'text', content: line });
    }
  }

  return (
    <div className={className}>
      {elements.map((el, i) => {
        if (el.type === 'bullet') {
          return (
            <div key={i} className="flex gap-1.5 ml-1 mt-0.5">
              <span className="text-surface-300 shrink-0">•</span>
              <span><InlineBold text={el.content} /></span>
            </div>
          );
        }
        return <p key={i} className={i > 0 ? 'mt-1' : ''}><InlineBold text={el.content} /></p>;
      })}
    </div>
  );
}

export function AgentMessage({ message, onOAuthConnect, onPlanConfirm, onNextAction, onDismissNextActions }: AgentMessageProps) {
  const isProcessing = message.status === 'processing';
  const isError = message.status === 'error';
  const hasSteps = message.steps && message.steps.length > 0;
  const hasCards = message.connectionCard || message.planPreview || message.toolResult || message.nextActions;

  return (
    <div className="animate-slide-up">
      {/* Elapsed time badge */}
      {message.elapsedMs !== undefined && (
        <p className="text-xs text-surface-300 mb-1.5">
          Worked for {formatElapsed(message.elapsedMs)}
        </p>
      )}

      {/* Main text content */}
      {message.content && (
        <p className={`text-[15px] leading-relaxed mb-1 ${
          isError ? 'text-red-600' : 'text-surface-700'
        }`}>
          <RichText text={message.content} />
        </p>
      )}

      {/* Steps — compact list */}
      {hasSteps && (
        <div className="mt-1.5 space-y-0">
          {message.steps!.map((step) => (
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

      {/* Thinking indicator — only when processing with no visible activity */}
      {isProcessing && !hasSteps && !hasCards && !message.content && (
        <ThinkingIndicator />
      )}
    </div>
  );
}
