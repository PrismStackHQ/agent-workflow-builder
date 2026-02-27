'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/components/auth-provider';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function StatBadge({ dot, label }: { dot: 'green' | 'indigo'; label: string }) {
  const dotColor = dot === 'green' ? 'bg-green-500' : 'bg-indigo-500';
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-gray-200 text-sm font-medium text-gray-700 shadow-sm">
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      {label}
    </span>
  );
}

function WizardStep({ label, description, done, href }: {
  label: string; description: string; done: boolean; href: string;
}) {
  return (
    <Link href={href} className="flex items-start gap-3 group">
      <div
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          done ? 'bg-green-500 border-green-500' : 'border-gray-300 group-hover:border-indigo-400'
        }`}
      >
        {done && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </div>
      <div>
        <p className={`text-sm font-medium ${done ? 'text-gray-400 line-through' : 'text-gray-900 group-hover:text-indigo-700'}`}>
          {label}
        </p>
        {!done && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </Link>
  );
}

function RecentRunRow({ run, agents }: { run: any; agents: any[] }) {
  const agent = agents.find((a) => a.id === run.agentId);
  const statusColors: Record<string, string> = {
    SUCCEEDED: 'bg-green-100 text-green-700',
    RUNNING: 'bg-blue-100 text-blue-700',
    FAILED: 'bg-red-100 text-red-700',
    PENDING: 'bg-gray-100 text-gray-600',
  };
  return (
    <div className="flex items-center justify-between px-6 py-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{agent?.name || 'Unknown agent'}</p>
        <p className="text-xs text-gray-400">
          {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Pending'}
        </p>
      </div>
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[run.status] || 'bg-gray-100 text-gray-700'}`}>
        {run.status}
      </span>
    </div>
  );
}

function SuggestionCard({ title, description, href }: {
  title: string; description: string; href: string;
}) {
  return (
    <Link href={href} className="block group">
      <Card className="hover:border-indigo-200 hover:shadow-indigo-100/50 transition-all duration-150">
        <CardContent>
          <p className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 mb-1">{title}</p>
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          <p className="text-xs text-indigo-600 font-medium mt-2 group-hover:underline">Try it →</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { orgName, workspaceName, workspaceId } = useAuthContext();
  const [agents, setAgents] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [allRuns, setAllRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [agentList, connList] = await Promise.all([
          apiClient.listAgents().catch(() => []),
          apiClient.listConnections().catch(() => []),
        ]);
        const agentArr = Array.isArray(agentList) ? agentList : [];
        const connArr = Array.isArray(connList) ? connList : [];
        setAgents(agentArr);
        setConnections(connArr);

        if (agentArr.length > 0) {
          const runArrays = await Promise.all(
            agentArr.map((a: any) => apiClient.listRuns(a.id).catch(() => []))
          );
          setAllRuns(runArrays.flat());
        } else {
          setAllRuns([]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

  const activeCount = agents.filter((a) => a.status === 'SCHEDULED').length;
  const executionCount = allRuns.length;

  const wizardSteps = [
    {
      label: 'Create your first agent',
      description: 'Define an automation with natural language.',
      done: agents.length > 0,
      href: '/agents/new',
    },
    {
      label: 'Connect a service',
      description: 'Link Gmail, Google Drive, Slack, or Notion.',
      done: connections.length > 0,
      href: '/connections',
    },
    {
      label: 'Watch an agent run',
      description: 'See your agent execute and produce results.',
      done: allRuns.some((r) => r.status === 'SUCCEEDED'),
      href: '/agents',
    },
  ];

  const completedSteps = wizardSteps.filter((s) => s.done).length;

  const recentRuns = [...allRuns]
    .sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime())
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-8">
      {/* Greeting + stats */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {getGreeting()}, {orgName || 'there'}
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          {workspaceName ? `Workspace: ${workspaceName} — ` : ''}Here&apos;s what&apos;s going on with your automations.
        </p>
        <div className="flex items-center gap-3 mt-4">
          <StatBadge dot="green" label={`${activeCount} active`} />
          <StatBadge dot="indigo" label={`${executionCount} executions`} />
        </div>
      </div>

      {/* Getting started wizard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Getting started</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Complete these steps to get the most out of Agent Workflow.
              </p>
            </div>
            <span className="text-xs font-medium text-gray-400">
              {completedSteps} of {wizardSteps.length}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedSteps / wizardSteps.length) * 100}%` }}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {wizardSteps.map((step, i) => (
              <WizardStep key={i} {...step} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">What is Agent Workflow?</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 leading-relaxed">
              Agent Workflow lets you describe automations in plain English.
              Our AI translates your instructions into scheduled jobs that
              connect your services — Gmail, Drive, Slack, and more.
            </p>
            <Link href="/agents/new" className="inline-block mt-3 text-sm text-indigo-600 font-medium hover:underline">
              Read more →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Quick start</h2>
          </CardHeader>
          <CardContent>
            <ol className="text-sm text-gray-600 space-y-2 list-none">
              {[
                'Go to Create Agent and type your workflow in natural language.',
                'Authorize any services the agent needs (OAuth).',
                'The agent is automatically scheduled and runs on your cron.',
                'Check Agents to see run history and status.',
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-indigo-600 font-bold shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* What's happening */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">What&apos;s happening</h2>
          {agents.length > 0 && (
            <Link href="/agents" className="text-sm text-indigo-600 font-medium hover:underline">
              View all agents
            </Link>
          )}
        </div>
        {recentRuns.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500 py-4 text-center">
                No agent runs yet.{' '}
                <Link href="/agents/new" className="text-indigo-600 font-medium hover:underline">
                  Create your first agent
                </Link>{' '}
                to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="divide-y divide-gray-100">
              {recentRuns.map((run: any) => (
                <RecentRunRow key={run.id} run={run} agents={agents} />
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Suggested for you */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Suggested for you</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SuggestionCard
            title="Schedule a daily email digest"
            description='Try: "Read my unread emails every morning at 8am and summarize them."'
            href="/agents/new"
          />
          <SuggestionCard
            title="Auto-file receipts to Drive"
            description='Try: "Find emails with PDF attachments weekly and save to a Receipts folder."'
            href="/agents/new"
          />
        </div>
      </div>
    </div>
  );
}
