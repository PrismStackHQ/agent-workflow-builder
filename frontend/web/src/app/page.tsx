'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/components/auth-provider';

export default function HomePage() {
  const router = useRouter();
  const { user, orgId } = useAuthContext();

  useEffect(() => {
    if (!user) {
      router.replace('/signin');
    } else if (orgId) {
      router.replace('/agents');
    }
  }, [user, orgId, router]);

  return null;
}
