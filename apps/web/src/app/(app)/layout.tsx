'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { LoadingState } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <LoadingState label="Checking your session…" />;

  return (
    <AppShell>
      <Suspense fallback={<LoadingState />}>{children}</Suspense>
    </AppShell>
  );
}
