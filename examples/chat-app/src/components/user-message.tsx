'use client';

import type { ChatMessage } from '@/lib/types';

export function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="flex justify-end animate-slide-up">
      <div className="max-w-[80%] bg-surface-800 text-white rounded-2xl rounded-br-md px-4 py-2.5">
        <p className="text-sm leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}
