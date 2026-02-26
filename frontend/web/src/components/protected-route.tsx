'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';
import { Navbar } from '@/components/navbar';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, initialized } = useAuthContext();

  useEffect(() => {
    if (initialized && !user) {
      router.replace('/signin');
    }
  }, [user, initialized, router]);

  if (!initialized || !user) {
    return null;
  }

  return (
    <>
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </>
  );
}
