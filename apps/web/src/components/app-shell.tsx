'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  FolderGit2,
  LayoutDashboard,
  LogOut,
  Menu,
  Rocket,
  Workflow,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderGit2 },
  { href: '/workflow-runs', label: 'Workflow Runs', icon: Workflow },
  { href: '/deployments', label: 'Deployments', icon: Rocket },
  { href: '/services', label: 'Services', icon: Activity },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const org = user?.memberships[0]?.organization;

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <aside className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            DW
          </span>
          <span>DeployWatch</span>
          <button
            type="button"
            className="icon-btn nav-close"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav>
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`nav-link ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setNavOpen(false)}
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn nav-open"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="org">
            <span className="muted small">Organization</span>
            <strong>{org?.name ?? '—'}</strong>
          </div>
          <div className="user">
            <div className="user-meta">
              <strong>{user?.name}</strong>
              <span className="muted small">{role}</span>
            </div>
            <button type="button" className="btn btn-ghost" onClick={handleLogout}>
              <LogOut size={16} aria-hidden /> Sign out
            </button>
          </div>
        </header>
        <main id="main" className="content">
          {children}
        </main>
      </div>
    </div>
  );
}
