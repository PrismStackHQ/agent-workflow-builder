'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { wsClient } from '@/lib/ws';
import type { ChatMessage, ChatStep, NextActionType, NextActionsData, PlanPreviewData, WorkflowResultItem, WsServerMessage } from '@/lib/types';

function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

/** Fallback display name when server doesn't provide one */
function fallbackDisplayName(provider: string): string {
  return provider.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ConnectionInfoFromServer {
  providerKey: string;
  displayName: string;
  logoUrl?: string;
}

export function useAgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [processing, setProcessing] = useState(false);
  const startTimeRef = useRef<number>(0);
  const currentAgentRef = useRef<string | null>(null);
  const currentRunRef = useRef<string | null>(null);

  // Store the pending plan until all connections are ready
  const pendingPlanRef = useRef<PlanPreviewData | null>(null);

  // Accumulate step results during a run for the final results card
  const runResultsRef = useRef<WorkflowResultItem[]>([]);

  // Deduplicate plan previews (NATS JetStream may redeliver)
  const seenCommandIdsRef = useRef<Set<string>>(new Set());

  // Connect WebSocket
  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002/ws';
    const apiKey = process.env.NEXT_PUBLIC_API_KEY || '';
    if (!apiKey) return;

    wsClient.connect(wsUrl, apiKey);

    const unsub = wsClient.onMessage((msg: WsServerMessage) => {
      handleWsMessage(msg);
    });

    return () => {
      unsub();
      wsClient.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAgentMessage = useCallback(
    (updater: (msg: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m.role === 'agent');
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = updater(updated[realIdx]);
        return updated;
      });
    },
    [],
  );

  const addStepToLastAgent = useCallback(
    (step: ChatStep) => {
      updateLastAgentMessage((msg) => ({
        ...msg,
        steps: [...(msg.steps || []), step],
      }));
    },
    [updateLastAgentMessage],
  );

  /**
   * After a connection is completed, check if all missing connections for the
   * pending plan are now satisfied. If so, show the plan confirmation card.
   */
  const maybeShowPlanConfirmation = useCallback(
    (currentMessages: ChatMessage[]) => {
      const plan = pendingPlanRef.current;
      if (!plan || plan.missingConnections.length === 0) return;

      // Check if every missing provider now has a connected card in messages
      const allReady = plan.missingConnections.every((provider) =>
        currentMessages.some(
          (msg) =>
            msg.connectionCard?.provider === provider &&
            msg.connectionCard?.connected,
        ),
      );

      if (allReady) {
        // All connections are ready — show the plan confirmation card
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'agent' as const,
            content: `All connections are ready! Please review the plan and confirm:`,
            timestamp: new Date(),
            status: 'processing' as const,
            planPreview: plan,
            steps: [
              {
                id: uid(),
                label: 'All connections established',
                status: 'completed' as const,
                icon: 'check' as const,
              },
            ],
          },
        ]);
      }
    },
    [],
  );

  const handleWsMessage = useCallback(
    (msg: WsServerMessage) => {
      const p = msg.payload || {};

      switch (msg.type) {
        case 'auth_success':
          setConnected(true);
          break;

        case 'auth_failed':
          setConnected(false);
          addMessage({
            id: uid(),
            role: 'system',
            content: 'Authentication failed. Please check your API key.',
            timestamp: new Date(),
            status: 'error',
          });
          break;

        case 'command_accepted':
          setProcessing(true);
          startTimeRef.current = Date.now();
          addMessage({
            id: uid(),
            role: 'agent',
            content: 'Let me work on that for you...',
            timestamp: new Date(),
            status: 'processing',
            steps: [
              {
                id: uid(),
                label: 'Analyzing your request',
                status: 'running',
                icon: 'search',
              },
            ],
          });
          break;

        case 'agent_plan_preview': {
          // Deduplicate — NATS JetStream may redeliver on reconnect
          const cmdId = p.commandId as string;
          if (seenCommandIdsRef.current.has(cmdId)) break;
          seenCommandIdsRef.current.add(cmdId);

          const planSteps = (p.steps as any[]) || [];
          const rawMissing = (p.missingConnections as (ConnectionInfoFromServer | string)[]) || [];
          const endUserId = (p.endUserId as string) || process.env.NEXT_PUBLIC_END_USER_ID || '';

          // Normalize: server sends ConnectionInfo objects, extract providerKeys for plan tracking
          const missingInfos: ConnectionInfoFromServer[] = rawMissing.map((item) =>
            typeof item === 'string'
              ? { providerKey: item, displayName: fallbackDisplayName(item) }
              : item,
          );
          const missingKeys = missingInfos.map((c) => c.providerKey);

          // Build connector display names from server data + missing connection info
          const serverDisplayNames = (p.connectorDisplayNames as Record<string, string>) || {};
          const connectorDisplayNames: Record<string, string> = { ...serverDisplayNames };
          // Also merge in display names from missing connection infos
          for (const info of missingInfos) {
            if (!connectorDisplayNames[info.providerKey]) {
              connectorDisplayNames[info.providerKey] = info.displayName;
            }
          }

          const plan: PlanPreviewData = {
            commandId: p.commandId as string,
            name: p.name as string,
            naturalLanguageCommand: p.naturalLanguageCommand as string,
            triggerType: p.triggerType as string,
            schedule: p.schedule as string | undefined,
            connectors: (p.connectors as string[]) || [],
            steps: planSteps,
            missingConnections: missingKeys,
            connectorDisplayNames,
            instructions: p.instructions as string | undefined,
            endUserId,
          };

          // Store the plan for later
          pendingPlanRef.current = plan;

          // Mark the "analyzing" step as completed
          updateLastAgentMessage((m) => ({
            ...m,
            content: `I've analyzed your request "${p.name as string}".`,
            status: 'complete' as const,
            steps: [
              ...(m.steps || []).map((s) =>
                s.status === 'running' ? { ...s, status: 'completed' as const } : s,
              ),
              {
                id: uid(),
                label: `Plan ready: ${planSteps.length} step${planSteps.length !== 1 ? 's' : ''}`,
                status: 'completed',
                icon: 'check',
              },
            ],
          }));

          if (missingInfos.length > 0) {
            // Show connection cards with enriched displayName/logoUrl from server
            for (const conn of missingInfos) {
              addMessage({
                id: uid(),
                role: 'agent',
                content: `You need to connect ${conn.displayName} before we can proceed:`,
                timestamp: new Date(),
                status: 'processing',
                connectionCard: {
                  provider: conn.providerKey,
                  displayName: conn.displayName,
                  logoUrl: conn.logoUrl,
                  connectionRefId: '',
                  agentDraftId: '',
                  connected: false,
                  tools: [],
                  endUserId,
                },
              });
            }
          } else {
            // No missing connections — show plan confirmation immediately
            addMessage({
              id: uid(),
              role: 'agent',
              content: `All connections are ready! Please review the plan and confirm:`,
              timestamp: new Date(),
              status: 'processing',
              planPreview: plan,
              steps: [
                {
                  id: uid(),
                  label: 'All connections verified',
                  status: 'completed',
                  icon: 'check',
                },
              ],
            });
          }
          break;
        }

        case 'agent_created': {
          currentAgentRef.current = p.agentId as string;
          const name = (p.name as string) || 'your workflow';
          updateLastAgentMessage((m) => ({
            ...m,
            content: `Great! I've set up "${name}" for you.`,
            agentId: p.agentId as string,
            steps: [
              ...(m.steps || []).map((s) =>
                s.status === 'running' ? { ...s, status: 'completed' as const } : s,
              ),
              {
                id: uid(),
                label: `Created agent: ${name}`,
                status: 'completed',
                icon: 'check',
              },
            ],
          }));
          break;
        }

        case 'wait_connection_oauth':
          addMessage({
            id: uid(),
            role: 'agent',
            content: `You need to connect ${fallbackDisplayName(p.provider as string)} to continue. Please authorize it below:`,
            timestamp: new Date(),
            status: 'processing',
            connectionCard: {
              provider: p.provider as string,
              displayName: fallbackDisplayName(p.provider as string),
              connectionRefId: p.connectionRefId as string,
              agentDraftId: p.agentDraftId as string,
              connected: false,
              tools: [],
              endUserId: (p.endUserId as string) || process.env.NEXT_PUBLIC_END_USER_ID || '',
            },
          });
          break;

        case 'agent_run_started':
          currentRunRef.current = p.runId as string;
          runResultsRef.current = [];
          // Update the existing "Creating agent" message instead of adding a new one
          updateLastAgentMessage((m) => ({
            ...m,
            content: 'Running your workflow now...',
            status: 'processing' as const,
            agentId: (p.agentId as string) || m.agentId,
            runId: p.runId as string,
            steps: [
              ...(m.steps || []),
              {
                id: uid(),
                label: 'Workflow started',
                status: 'completed' as const,
                icon: 'play' as const,
              },
            ],
          }));
          break;

        case 'agent_run_thinking': {
          const thinkingText = (p.text as string) || '';
          if (thinkingText) {
            // Add a new agent message with the reasoning text
            addMessage({
              id: uid(),
              role: 'agent',
              content: thinkingText,
              timestamp: new Date(),
              status: 'processing',
              agentId: (p.agentId as string) || currentAgentRef.current || undefined,
              runId: (p.runId as string) || currentRunRef.current || undefined,
            });
          }
          break;
        }

        case 'agent_run_step_completed': {
          const stepResult = p.result;
          const stepIndex = p.stepIndex as number;
          const stepName = (p.stepName as string) || `Step ${stepIndex}`;
          const stepDescription = p.stepDescription as string | undefined;
          const stepStatus = (p.status as string) || 'completed';
          const stepIcon = (p.icon as string) || 'check';
          const inputSummary = p.inputSummary as string | undefined;
          const outputSummary = p.outputSummary as string | undefined;
          const stepArguments = p.arguments as Record<string, unknown> | undefined;
          const iconCast = stepIcon as 'check' | 'search' | 'link' | 'cog' | 'play' | 'pause' | 'zap';

          // For "running" status, add a spinner step with arguments inline
          if (stepStatus === 'running') {
            addStepToLastAgent({
              id: uid(),
              label: stepDescription || stepName,
              status: 'running',
              icon: iconCast || 'cog',
              inputSummary,
              arguments: stepArguments,
            });
            break;
          }

          // For "completed"/"failed", update the last running step with result data
          updateLastAgentMessage((m) => {
            const steps = [...(m.steps || [])];
            let lastRunningIdx = -1;
            for (let i = steps.length - 1; i >= 0; i--) {
              if (steps[i].status === 'running') { lastRunningIdx = i; break; }
            }
            const stepData = {
              id: uid(),
              label: stepDescription || stepName,
              status: (stepStatus === 'failed' ? 'failed' : 'completed') as 'completed' | 'failed',
              icon: (stepStatus === 'failed' ? 'zap' : iconCast || 'check') as 'check' | 'search' | 'link' | 'cog' | 'play' | 'pause' | 'zap',
              inputSummary,
              outputSummary,
              arguments: stepArguments,
              result: stepResult,
            };
            if (lastRunningIdx >= 0) {
              steps[lastRunningIdx] = { ...steps[lastRunningIdx], ...stepData };
            } else {
              steps.push(stepData);
            }
            return { ...m, steps };
          });
          break;
        }

        case 'agent_run_succeeded': {
          const elapsed = Date.now() - startTimeRef.current;
          setProcessing(false);
          pendingPlanRef.current = null;
          runResultsRef.current = [];

          // Mark all processing agent messages as complete
          setMessages((prev) => prev.map((m) =>
            m.role === 'agent' && m.status === 'processing'
              ? {
                  ...m,
                  status: 'complete' as const,
                  steps: (m.steps || []).map((s) =>
                    s.status === 'running'
                      ? { ...s, status: 'completed' as const, icon: 'check' as const }
                      : s,
                  ),
                }
              : m,
          ));

          // Add a final completion message with summary
          addMessage({
            id: uid(),
            role: 'agent',
            content: (p.summary as string) || 'Workflow completed successfully!',
            timestamp: new Date(),
            status: 'complete',
            agentId: (p.agentId as string) || currentAgentRef.current || undefined,
            runId: (p.runId as string) || currentRunRef.current || undefined,
            elapsedMs: elapsed,
            nextActions: {
              agentId: p.agentId as string,
              runId: p.runId as string,
              workflowName: (p.name as string) || undefined,
            },
            steps: [{
              id: uid(),
              label: 'Completed successfully',
              status: 'completed' as const,
              icon: 'check' as const,
            }],
          });
          break;
        }

        case 'agent_run_failed': {
          setProcessing(false);
          pendingPlanRef.current = null;
          runResultsRef.current = [];
          const errorMsg = (p.error as string) || 'Unknown error';

          // Mark all processing agent messages as failed
          setMessages((prev) => prev.map((m) =>
            m.role === 'agent' && m.status === 'processing'
              ? {
                  ...m,
                  status: 'complete' as const,
                  steps: (m.steps || []).map((s) =>
                    s.status === 'running'
                      ? { ...s, status: 'failed' as const, icon: 'zap' as const }
                      : s,
                  ),
                }
              : m,
          ));

          addMessage({
            id: uid(),
            role: 'agent',
            content: `Something went wrong: ${errorMsg}`,
            timestamp: new Date(),
            status: 'error',
            agentId: (p.agentId as string) || currentAgentRef.current || undefined,
            runId: (p.runId as string) || currentRunRef.current || undefined,
            steps: [{
              id: uid(),
              label: errorMsg.length > 80 ? errorMsg.substring(0, 77) + '...' : errorMsg,
              status: 'failed' as const,
              icon: 'zap' as const,
            }],
          });
          break;
        }

        case 'agent_run_paused':
          addMessage({
            id: uid(),
            role: 'agent',
            content: `The workflow needs access to ${fallbackDisplayName(p.integrationKey as string)}. Please connect it to continue.`,
            timestamp: new Date(),
            status: 'processing',
            agentId: p.agentId as string,
            runId: p.runId as string,
            connectionCard: {
              provider: p.integrationKey as string,
              displayName: fallbackDisplayName(p.integrationKey as string),
              connectionRefId: '',
              agentDraftId: '',
              connected: false,
              tools: [p.actionName as string].filter(Boolean),
              endUserId: (p.endUserId as string) || process.env.NEXT_PUBLIC_END_USER_ID || '',
            },
            steps: [
              {
                id: uid(),
                label: `Paused — waiting for ${fallbackDisplayName(p.integrationKey as string)} connection`,
                status: 'running',
                icon: 'pause',
              },
            ],
          });
          break;

        case 'agent_run_resumed':
          addMessage({
            id: uid(),
            role: 'agent',
            content: 'Connection established! Resuming the workflow...',
            timestamp: new Date(),
            status: 'processing',
            steps: [
              {
                id: uid(),
                label: 'Resumed workflow',
                status: 'completed',
                icon: 'play',
              },
            ],
          });
          break;

        case 'agent_run_iteration_progress': {
          const status = p.status as string;
          const idx = p.iterationIndex as number;
          const total = p.totalItems as number;
          const itemLabel = p.itemLabel as string | undefined;
          if (status === 'started') {
            addStepToLastAgent({
              id: uid(),
              label: `Processing item ${idx + 1} of ${total}${itemLabel ? ` — ${itemLabel.substring(0, 50)}` : ''}`,
              status: 'running',
              icon: 'play',
            });
          } else if (status === 'completed') {
            updateLastAgentMessage((m) => ({
              ...m,
              steps: (m.steps || []).map((s) =>
                s.status === 'running' && s.label?.includes(`item ${idx + 1}`)
                  ? { ...s, status: 'completed' as const, icon: 'check' as const }
                  : s,
              ),
            }));
          } else if (status === 'failed') {
            updateLastAgentMessage((m) => ({
              ...m,
              steps: (m.steps || []).map((s) =>
                s.status === 'running' && s.label?.includes(`item ${idx + 1}`)
                  ? { ...s, status: 'failed' as const, icon: 'zap' as const }
                  : s,
              ),
            }));
          }
          break;
        }

        case 'agent_run_sub_agent_started':
          addStepToLastAgent({
            id: uid(),
            label: `Running sub-agent: ${p.childAgentName as string}`,
            status: 'running',
            icon: 'play',
          });
          break;

        case 'agent_scheduled':
          addStepToLastAgent({
            id: uid(),
            label: `Scheduled${p.nextRunAt ? ` — next run: ${new Date(p.nextRunAt as string).toLocaleString()}` : ''}`,
            status: 'completed',
            icon: 'zap',
          });
          break;

        default:
          break;
      }
    },
    [addMessage, updateLastAgentMessage, addStepToLastAgent],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      // Add user message
      addMessage({
        id: uid(),
        role: 'user',
        content,
        timestamp: new Date(),
        status: 'complete',
      });

      // Submit via WebSocket for real-time flow
      const endUserId = process.env.NEXT_PUBLIC_END_USER_ID;
      wsClient.submitCommand(content, endUserId);
    },
    [addMessage],
  );

  const handleOAuthComplete = useCallback(
    async (provider: string, endUserId: string, nangoConnectionId: string) => {
      // Register the completed connection with our platform via REST API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
      const apiKey = process.env.NEXT_PUBLIC_API_KEY || '';

      try {
        await fetch(`${apiUrl}/connections/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
          },
          body: JSON.stringify({
            integrationKey: provider,
            connectionId: nangoConnectionId,
            endUserId,
          }),
        });
      } catch (err) {
        console.error('Failed to register connection:', err);
      }

      // Update the connection card in messages and check if plan can be shown
      setMessages((prev) => {
        const updated = prev.map((msg) => {
          if (msg.connectionCard?.provider === provider && !msg.connectionCard?.connected) {
            return {
              ...msg,
              status: 'complete' as const,
              connectionCard: { ...msg.connectionCard, connected: true },
            };
          }
          return msg;
        });

        // Check if all missing connections are now ready — if so, show plan confirmation
        const plan = pendingPlanRef.current;
        if (plan && plan.missingConnections.length > 0) {
          const allReady = plan.missingConnections.every((p) =>
            updated.some(
              (msg) =>
                msg.connectionCard?.provider === p &&
                msg.connectionCard?.connected,
            ),
          );

          if (allReady) {
            return [
              ...updated,
              {
                id: uid(),
                role: 'agent' as const,
                content: `All connections are ready! Please review the plan and confirm:`,
                timestamp: new Date(),
                status: 'processing' as const,
                planPreview: plan,
                steps: [
                  {
                    id: uid(),
                    label: 'All connections established',
                    status: 'completed' as const,
                    icon: 'check' as const,
                  },
                ],
              },
            ];
          }
        }

        return updated;
      });
    },
    [],
  );

  const confirmPlan = useCallback(
    (plan: PlanPreviewData) => {
      pendingPlanRef.current = null;

      // Always run as manual on initial confirm — scheduling is offered as a post-run option
      wsClient.send('agent_plan_confirm', {
        commandId: plan.commandId,
        name: plan.name,
        naturalLanguageCommand: plan.naturalLanguageCommand,
        triggerType: 'manual',
        connectors: plan.connectors,
        steps: plan.steps,
        instructions: plan.instructions,
        endUserId: plan.endUserId,
      });

      addMessage({
        id: uid(),
        role: 'agent',
        content: 'Creating your agent and running it now...',
        timestamp: new Date(),
        status: 'processing',
        steps: [{ id: uid(), label: 'Creating agent', status: 'running', icon: 'cog' }],
      });
    },
    [addMessage],
  );

  const handleNextAction = useCallback(
    (actionType: NextActionType, data: NextActionsData) => {
      switch (actionType) {
        case 'schedule':
          addMessage({
            id: uid(),
            role: 'user',
            content: 'Schedule this workflow',
            timestamp: new Date(),
            status: 'complete',
          });
          wsClient.submitCommand(
            `Schedule the workflow "${data.workflowName || 'this workflow'}" to run on a recurring schedule`,
            process.env.NEXT_PUBLIC_END_USER_ID,
          );
          break;

        case 'actions_on_data':
          addMessage({
            id: uid(),
            role: 'user',
            content: 'Take actions on the results',
            timestamp: new Date(),
            status: 'complete',
          });
          // Prompt the user to describe what action they want
          addMessage({
            id: uid(),
            role: 'agent',
            content: 'What would you like to do with the results? For example: summarize, download, send via email, update records, etc.',
            timestamp: new Date(),
            status: 'complete',
          });
          break;

        case 'save':
          addMessage({
            id: uid(),
            role: 'user',
            content: 'Save this workflow',
            timestamp: new Date(),
            status: 'complete',
          });
          addMessage({
            id: uid(),
            role: 'agent',
            content: 'Workflow saved! You can run it again anytime from your saved workflows.',
            timestamp: new Date(),
            status: 'complete',
            steps: [{ id: uid(), label: 'Workflow saved', status: 'completed', icon: 'check' }],
          });
          break;
      }

      // Dismiss the next actions card on the message that triggered it
      dismissNextActions();
    },
    [addMessage],
  );

  const dismissNextActions = useCallback(() => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.nextActions && !msg.nextActions.dismissed
          ? { ...msg, nextActions: { ...msg.nextActions, dismissed: true } }
          : msg,
      ),
    );
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setProcessing(false);
    pendingPlanRef.current = null;
    currentAgentRef.current = null;
    currentRunRef.current = null;
  }, []);

  return {
    messages,
    connected,
    processing,
    sendMessage,
    handleOAuthComplete,
    confirmPlan,
    clearMessages,
    handleNextAction,
    dismissNextActions,
  };
}
