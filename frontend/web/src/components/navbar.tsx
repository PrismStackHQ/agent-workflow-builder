'use client';

import { useAuthContext } from '@/components/auth-provider';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/connections', label: 'Connections' },
  { href: '/agents', label: 'Agents' },
  { href: '/agents/new', label: 'Create Agent' },
  { href: '/settings', label: 'Settings' },
];

export function Navbar() {
  const { user, orgName, signOut } = useAuthContext();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-gray-900">Agent Workflow</span>
          </a>
          <div className="flex gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + '/');
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {orgName && (
            <span className="text-sm text-gray-500">{orgName}</span>
          )}
          <button
            onClick={signOut}
            className="text-sm text-gray-500 hover:text-red-600 transition-colors font-medium"
          >
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
