'use client';

import { useState } from 'react';
import { useAgentChat } from '@/hooks/use-agent-chat';
import { MessageList } from './message-list';
import { ChatInput } from './chat-input';
import type { ChatSession } from '@/lib/types';

function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 pulse-dot' : 'bg-red-400'}`}
    />
  );
}

export function ChatContainer() {
  const { messages, connected, processing, sendMessage, handleOAuthComplete, clearMessages } =
    useAgentChat();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions] = useState<ChatSession[]>([]);

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-72 border-r border-surface-200 bg-surface-50 flex flex-col shrink-0">
          {/* Sidebar header */}
          <div className="p-4 border-b border-surface-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold text-surface-900">Agent Workflow</h1>
                <p className="text-xs text-surface-500">Chat</p>
              </div>
            </div>
          </div>

          {/* New chat button */}
          <div className="p-3">
            <button
              onClick={clearMessages}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-surface-700 bg-white border border-surface-200 rounded-lg hover:bg-surface-50 hover:border-surface-300 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New chat
            </button>
          </div>

          {/* Chat history */}
          <div className="flex-1 overflow-y-auto chat-scroll px-3">
            {sessions.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-surface-400">No chat history yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-xs font-medium text-surface-400 uppercase tracking-wider px-2 py-2">
                  Today
                </p>
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface-100 transition-colors group"
                  >
                    <p className="text-sm font-medium text-surface-700 truncate group-hover:text-surface-900">
                      {session.title}
                    </p>
                    <p className="text-xs text-surface-400 truncate mt-0.5">{session.preview}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar footer */}
          <div className="p-3 border-t border-surface-200">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <ConnectionDot connected={connected} />
              <span className="text-xs text-surface-500">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="h-14 border-b border-surface-200 flex items-center justify-between px-4 lg:px-8 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-surface-900">
                {messages.length > 0 ? 'Chat' : 'New Chat'}
              </h2>
              {processing && (
                <span className="inline-flex items-center gap-1 text-xs text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                  <div className="w-1.5 h-1.5 bg-primary-500 rounded-full pulse-dot" />
                  Processing
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-lg transition-colors">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <MessageList messages={messages} onOAuthConnect={handleOAuthComplete} />

        {/* Input */}
        <ChatInput
          onSend={sendMessage}
          disabled={!connected}
          placeholder={connected ? 'Describe your workflow...' : 'Connecting...'}
        />
      </div>
    </div>
  );
}
