'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { wsClient } from '@/lib/ws';
import type { ChatMessage, ChatStep, PlanPreviewData, WsServerMessage } from '@/lib/types';

function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

function providerDisplayName(provider: string): string {
  const names: Record<string, string> = {
    gmail: 'Gmail',
    gdrive: 'Google Drive',
    'google-drive': 'Google Drive',
    'google-mail': 'Google Mail',
    'google-calendar': 'Google Calendar',
    slack: 'Slack',
    notion: 'Notion',
    google_sheets: 'Google Sheets',
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
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
          const planSteps = (p.steps as any[]) || [];
          const missingConns = (p.missingConnections as string[]) || [];
          const endUserId = (p.endUserId as string) || process.env.NEXT_PUBLIC_END_USER_ID || '';

          const plan: PlanPreviewData = {
            commandId: p.commandId as string,
            name: p.name as string,
            naturalLanguageCommand: p.naturalLanguageCommand as string,
            triggerType: p.triggerType as string,
            schedule: p.schedule as string | undefined,
            connectors: (p.connectors as string[]) || [],
            steps: planSteps,
            missingConnections: missingConns,
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

          if (missingConns.length > 0) {
            // Step 1: Show connection cards first — plan confirmation comes after all connected
            for (const provider of missingConns) {
              addMessage({
                id: uid(),
                role: 'agent',
                content: `You need to connect ${providerDisplayName(provider)} before we can proceed:`,
                timestamp: new Date(),
                status: 'processing',
                connectionCard: {
                  provider,
                  displayName: providerDisplayName(provider),
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
            content: `You need to connect ${providerDisplayName(p.provider as string)} to continue. Please authorize it below:`,
            timestamp: new Date(),
            status: 'processing',
            connectionCard: {
              provider: p.provider as string,
              displayName: providerDisplayName(p.provider as string),
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
          addMessage({
            id: uid(),
            role: 'agent',
            content: 'Running your workflow now...',
            timestamp: new Date(),
            status: 'processing',
            agentId: p.agentId as string,
            runId: p.runId as string,
            steps: [
              {
                id: uid(),
                label: 'Workflow started',
                status: 'completed',
                icon: 'play',
              },
            ],
          });
          break;

        case 'agent_run_step_completed':
          addStepToLastAgent({
            id: uid(),
            label: (p.stepName as string) || `Step ${p.stepIndex} completed`,
            status: 'completed',
            icon: 'check',
          });
          break;

        case 'agent_run_succeeded': {
          const elapsed = Date.now() - startTimeRef.current;
          setProcessing(false);
          pendingPlanRef.current = null;
          addMessage({
            id: uid(),
            role: 'agent',
            content: (p.summary as string) || 'Workflow completed successfully!',
            timestamp: new Date(),
            status: 'complete',
            agentId: p.agentId as string,
            runId: p.runId as string,
            elapsedMs: elapsed,
            steps: [
              {
                id: uid(),
                label: 'Completed successfully',
                status: 'completed',
                icon: 'check',
              },
            ],
          });
          break;
        }

        case 'agent_run_failed':
          setProcessing(false);
          pendingPlanRef.current = null;
          addMessage({
            id: uid(),
            role: 'agent',
            content: `Something went wrong: ${(p.error as string) || 'Unknown error'}`,
            timestamp: new Date(),
            status: 'error',
            agentId: p.agentId as string,
            runId: p.runId as string,
          });
          break;

        case 'agent_run_paused':
          addMessage({
            id: uid(),
            role: 'agent',
            content: `The workflow needs access to ${providerDisplayName(p.integrationKey as string)}. Please connect it to continue.`,
            timestamp: new Date(),
            status: 'processing',
            agentId: p.agentId as string,
            runId: p.runId as string,
            connectionCard: {
              provider: p.integrationKey as string,
              displayName: providerDisplayName(p.integrationKey as string),
              connectionRefId: '',
              agentDraftId: '',
              connected: false,
              tools: [p.actionName as string].filter(Boolean),
              endUserId: (p.endUserId as string) || process.env.NEXT_PUBLIC_END_USER_ID || '',
            },
            steps: [
              {
                id: uid(),
                label: `Paused — waiting for ${providerDisplayName(p.integrationKey as string)} connection`,
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

      wsClient.send('agent_plan_confirm', {
        commandId: plan.commandId,
        name: plan.name,
        naturalLanguageCommand: plan.naturalLanguageCommand,
        triggerType: plan.triggerType,
        schedule: plan.schedule,
        connectors: plan.connectors,
        steps: plan.steps,
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
  };
}
