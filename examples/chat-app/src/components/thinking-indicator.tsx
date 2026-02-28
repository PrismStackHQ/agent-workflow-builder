'use client';

export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="thinking-dot w-2 h-2 rounded-full bg-primary-400" />
      <span className="thinking-dot w-2 h-2 rounded-full bg-primary-400" />
      <span className="thinking-dot w-2 h-2 rounded-full bg-primary-400" />
    </div>
  );
}
