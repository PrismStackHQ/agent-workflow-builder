'use client';

import { useState } from 'react';
import type { ConnectionCardData } from '@/lib/types';

const providerLogos: Record<string, string> = {
  gmail: 'https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png',
  'google-mail': 'https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png',
  gdrive: 'https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png',
  'google-drive': 'https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png',
  slack: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
  notion: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png',
};

const providerDescriptions: Record<string, string> = {
  gmail: 'An integration with Google Mail. Allows reading, sending, and managing emails.',
  'google-mail': 'An integration with Google Mail. Allows reading, sending, and managing emails.',
  gdrive: 'An integration with Google Drive. Allows searching files and folders, creating folders and shortcuts, uploading files, sharing, and managing permissions.',
  'google-drive': 'An integration with Google Drive. Allows searching files and folders, creating folders and shortcuts, uploading files, sharing, and managing permissions.',
  slack: 'An integration with Slack. Allows sending messages, managing channels, and more.',
  notion: 'An integration with Notion. Allows creating and managing pages, databases, and more.',
};

interface ConnectionCardProps {
  card: ConnectionCardData;
  onConnect: (connectionRefId: string, provider: string) => void;
}

export function ConnectionCard({ card, onConnect }: ConnectionCardProps) {
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const logoUrl = card.logoUrl || providerLogos[card.provider];
  const description = card.description || providerDescriptions[card.provider] || `An integration with ${card.displayName}.`;

  const handleConnect = () => {
    setConnecting(true);
    onConnect(card.connectionRefId, card.provider);
  };

  return (
    <div className="animate-slide-up my-3">
      <div className="bg-surface-50 rounded-xl border border-surface-200 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-100">
          <p className="text-xs text-surface-500 font-medium">
            The agent has requested access to the following connections:
          </p>
        </div>

        {/* Connection row */}
        <div className="px-4 py-4">
          <div className="bg-white rounded-lg border border-surface-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img src={logoUrl} alt={card.displayName} className="w-8 h-8 rounded" />
                ) : (
                  <div className="w-8 h-8 rounded bg-primary-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.342" />
                    </svg>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-surface-900">{card.displayName}</span>
                    {card.userEmail && (
                      <span className="text-xs text-surface-400">{card.userEmail}</span>
                    )}
                  </div>
                </div>
              </div>

              {card.connected ? (
                <span className="inline-flex items-center gap-1.5 text-sm text-green-600 font-medium">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.556a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.342" />
                  </svg>
                  Connected
                </span>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </div>

            {/* Description */}
            <p className="text-xs text-surface-500 mt-2 leading-relaxed">{description}</p>

            {/* Tools */}
            {card.tools && card.tools.length > 0 && (
              <div className="mt-3">
                <button
                  onClick={() => setToolsExpanded(!toolsExpanded)}
                  className="text-xs text-primary-600 font-medium hover:text-primary-700 flex items-center gap-1"
                >
                  Requesting access to{' '}
                  <span className="text-primary-700 font-semibold">{card.tools.length} tools</span>
                  <svg
                    className={`w-3 h-3 transition-transform ${toolsExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {toolsExpanded && (
                  <div className="mt-2 space-y-1">
                    {card.tools.map((tool, i) => (
                      <div key={i} className="text-xs text-surface-600 pl-3 py-0.5 border-l-2 border-surface-200">
                        {tool}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
