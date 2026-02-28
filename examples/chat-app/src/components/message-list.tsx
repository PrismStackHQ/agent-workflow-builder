'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';
import { UserMessage } from './user-message';
import { AgentMessage } from './agent-message';

interface MessageListProps {
  messages: ChatMessage[];
  onOAuthConnect: (provider: string, endUserId: string, nangoConnectionId: string) => void;
}

export function MessageList({ messages, onOAuthConnect }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary-500/20">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-surface-900 mb-2">Agent Workflow Chat</h2>
          <p className="text-sm text-surface-500 leading-relaxed">
            Describe what you want to automate in plain English. I&apos;ll set up the connections,
            create the workflow, and run it for you.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {[
              'Find invoices from my Google Drive',
              'Summarize my unread emails daily',
              'Save email attachments to Drive',
            ].map((suggestion) => (
              <span
                key={suggestion}
                className="px-3 py-1.5 text-xs bg-surface-100 text-surface-600 rounded-full border border-surface-200 hover:bg-surface-200 cursor-default"
              >
                {suggestion}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll px-4 lg:px-8 py-6 space-y-6">
      {messages.map((msg) => {
        if (msg.role === 'user') {
          return <UserMessage key={msg.id} message={msg} />;
        }
        if (msg.role === 'agent') {
          return <AgentMessage key={msg.id} message={msg} onOAuthConnect={onOAuthConnect} />;
        }
        // System messages
        return (
          <div key={msg.id} className="flex justify-center animate-slide-up">
            <span
              className={`text-xs px-3 py-1 rounded-full ${
                msg.status === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-100'
                  : 'bg-surface-100 text-surface-500'
              }`}
            >
              {msg.content}
            </span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
