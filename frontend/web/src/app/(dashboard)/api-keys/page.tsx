'use client';

import { useState } from 'react';
import { useAuthContext } from '@/components/auth-provider';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
    >
      {copied ? (
        <>
          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <span className="text-green-600">Copied!</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

function MaskedKey({ apiKey }: { apiKey: string }) {
  const [revealed, setRevealed] = useState(false);

  const masked = apiKey.length > 8
    ? apiKey.slice(0, 4) + '\u2022'.repeat(Math.min(apiKey.length - 8, 24)) + apiKey.slice(-4)
    : '\u2022'.repeat(apiKey.length);

  return (
    <div className="flex items-center gap-3">
      <code className="flex-1 text-sm font-mono bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-gray-800 select-all break-all">
        {revealed ? apiKey : masked}
      </code>
      <div className="flex flex-col gap-2 shrink-0">
        <button
          onClick={() => setRevealed((r) => !r)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          {revealed ? (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
              Hide
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Reveal
            </>
          )}
        </button>
        <CopyButton text={apiKey} />
      </div>
    </div>
  );
}

export default function ApiKeysPage() {
  const { workspaceName, workspaces, workspaceId } = useAuthContext();

  const currentWorkspace = workspaces.find((ws) => ws.id === workspaceId);
  const otherWorkspaces = workspaces.filter((ws) => ws.id !== workspaceId);

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">API Keys</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Use these keys to authenticate with the Agent Workflow SDK and API.
        </p>
      </div>

      {/* Current workspace key */}
      {currentWorkspace && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-indigo-600">
                    {workspaceName ? workspaceName[0].toUpperCase() : 'W'}
                  </span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-gray-900">{workspaceName}</h2>
                  <p className="text-xs text-gray-500">Current workspace</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Active
              </span>
            </div>
          </div>
          <div className="px-6 py-5">
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              API Key
            </label>
            <MaskedKey apiKey={currentWorkspace.apiKey} />
          </div>
        </div>
      )}

      {/* Usage example */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Quick start</h2>
          <p className="text-xs text-gray-500 mt-0.5">Use your API key with the SDK</p>
        </div>
        <div className="px-6 py-5 space-y-5">
          {/* Client setup */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Initialize the client</p>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm leading-relaxed">
                <code>
                  <span className="text-purple-400">import</span>
                  <span className="text-gray-300"> {'{ '}</span>
                  <span className="text-yellow-300">AgentWorkflowClient</span>
                  <span className="text-gray-300">{' }'} </span>
                  <span className="text-purple-400">from</span>
                  <span className="text-green-400"> &apos;@agent-workflow/sdk&apos;</span>
                  <span className="text-gray-300">;</span>
                  {'\n\n'}
                  <span className="text-purple-400">const</span>
                  <span className="text-blue-300"> client</span>
                  <span className="text-gray-300"> = </span>
                  <span className="text-purple-400">new</span>
                  <span className="text-yellow-300"> AgentWorkflowClient</span>
                  <span className="text-gray-300">({'{\n'}</span>
                  <span className="text-blue-300">  apiKey</span>
                  <span className="text-gray-300">: </span>
                  <span className="text-green-400">&apos;{currentWorkspace ? currentWorkspace.apiKey.slice(0, 4) + '...' : 'ws_...'}&apos;</span>
                  <span className="text-gray-300">,{'\n'}</span>
                  <span className="text-blue-300">  baseUrl</span>
                  <span className="text-gray-300">: </span>
                  <span className="text-green-400">&apos;http://localhost:3001/api/v1&apos;</span>
                  <span className="text-gray-300">,{'\n'}</span>
                  <span className="text-blue-300">  endUserId</span>
                  <span className="text-gray-300">: </span>
                  <span className="text-green-400">&apos;end-user-123&apos;</span>
                  <span className="text-gray-300">,{'\n'}</span>
                  <span className="text-gray-300">{'}'});</span>
                  {'\n\n'}
                  <span className="text-gray-500">// Create an agent via natural language</span>
                  {'\n'}
                  <span className="text-purple-400">const</span>
                  <span className="text-blue-300"> result</span>
                  <span className="text-gray-300"> = </span>
                  <span className="text-purple-400">await</span>
                  <span className="text-gray-300"> client.</span>
                  <span className="text-blue-300">agents</span>
                  <span className="text-gray-300">.</span>
                  <span className="text-yellow-300">submitCommand</span>
                  <span className="text-gray-300">({'\n'}</span>
                  <span className="text-green-400">  &apos;find invoices from gmail and upload to drive&apos;</span>
                  {'\n'}
                  <span className="text-gray-300">);</span>
                </code>
              </pre>
            </div>
          </div>

          {/* WebSocket usage */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Real-time WebSocket events</p>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm leading-relaxed">
                <code>
                  <span className="text-gray-500">// Connect to receive real-time events</span>
                  {'\n'}
                  <span className="text-purple-400">await</span>
                  <span className="text-gray-300"> client.</span>
                  <span className="text-yellow-300">connect</span>
                  <span className="text-gray-300">();</span>
                  {'\n\n'}
                  <span className="text-gray-300">client.</span>
                  <span className="text-yellow-300">on</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-green-400">&apos;run:started&apos;</span>
                  <span className="text-gray-300">, (e) =&gt; {'{\n'}</span>
                  <span className="text-gray-300">  console.</span>
                  <span className="text-yellow-300">log</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-green-400">&apos;Run started:&apos;</span>
                  <span className="text-gray-300">, e.runId);{'\n}'});</span>
                  {'\n\n'}
                  <span className="text-gray-300">client.</span>
                  <span className="text-yellow-300">on</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-green-400">&apos;run:step_completed&apos;</span>
                  <span className="text-gray-300">, (e) =&gt; {'{\n'}</span>
                  <span className="text-gray-300">  console.</span>
                  <span className="text-yellow-300">log</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-green-400">`Step ${'${e.stepIndex}'} done:`</span>
                  <span className="text-gray-300">, e.stepName);{'\n}'});</span>
                  {'\n\n'}
                  <span className="text-gray-300">client.</span>
                  <span className="text-yellow-300">on</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-green-400">&apos;run:paused&apos;</span>
                  <span className="text-gray-300">, (e) =&gt; {'{\n'}</span>
                  <span className="text-gray-300">  console.</span>
                  <span className="text-yellow-300">log</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-green-400">&apos;Needs OAuth:&apos;</span>
                  <span className="text-gray-300">, e.providerConfigKey);{'\n}'});</span>
                  {'\n\n'}
                  <span className="text-gray-300">client.</span>
                  <span className="text-yellow-300">on</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-green-400">&apos;run:succeeded&apos;</span>
                  <span className="text-gray-300">, (e) =&gt; {'{\n'}</span>
                  <span className="text-gray-300">  console.</span>
                  <span className="text-yellow-300">log</span>
                  <span className="text-gray-300">(</span>
                  <span className="text-green-400">&apos;Completed:&apos;</span>
                  <span className="text-gray-300">, e.summary);{'\n}'});</span>
                  {'\n\n'}
                  <span className="text-gray-500">// Disconnect when done</span>
                  {'\n'}
                  <span className="text-gray-300">client.</span>
                  <span className="text-yellow-300">disconnect</span>
                  <span className="text-gray-300">();</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Other workspaces */}
      {otherWorkspaces.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Other workspaces</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              API keys for your other workspaces
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {otherWorkspaces.map((ws) => (
              <div key={ws.id} className="px-6 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-gray-600">
                      {ws.name[0].toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{ws.name}</span>
                </div>
                <MaskedKey apiKey={ws.apiKey} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security note */}
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
        <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-800">Keep your API keys secure</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Never share your API keys in public repositories or client-side code.
            Use environment variables to store them securely.
          </p>
        </div>
      </div>
    </div>
  );
}
