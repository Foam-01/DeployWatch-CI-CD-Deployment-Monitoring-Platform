import { Suspense } from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card card">
        <div className="brand auth-brand">
          <span className="brand-mark" aria-hidden>
            DW
          </span>
          <span>DeployWatch</span>
        </div>
        <Suspense>{children}</Suspense>
      </div>
    </main>
  );
}
