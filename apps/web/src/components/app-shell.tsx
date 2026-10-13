'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  BellRing,
  FolderGit2,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Menu,
  Rocket,
  ScrollText,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useApi } from '@/lib/use-api';

const NAV = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderGit2 },
  { href: '/workflow-runs', label: 'Workflow Runs', icon: Workflow },
  { href: '/deployments', label: 'Deployments', icon: Rocket },
  { href: '/services', label: 'Services', icon: Activity },
  { href: '/incidents', label: 'Incidents', icon: AlertTriangle },
];

const SETTINGS_NAV = [
  { href: '/settings/members', label: 'Members', icon: Users },
  { href: '/settings/integrations', label: 'Integrations', icon: KeyRound },
  { href: '/settings/notifications', label: 'Notifications', icon: BellRing },
  { href: '/settings/audit-logs', label: 'Audit log', icon: ScrollText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, role, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const org = user?.memberships[0]?.organization;

  // Mobile drawer: Escape closes it and focus returns to the button that opened it.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNavOpen(false);
        openButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {navOpen && (
        <button
          type="button"
          className="nav-backdrop"
          aria-hidden
          tabIndex={-1}
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside id="main-nav" className={`sidebar ${navOpen ? 'open' : ''}`} aria-label="Main navigation">
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
          {NAV.map((item) => (
            <NavLink key={item.href} {...item} pathname={pathname} onNavigate={() => setNavOpen(false)} />
          ))}
          <p className="nav-section">Settings</p>
          {SETTINGS_NAV.map((item) => (
            <NavLink key={item.href} {...item} pathname={pathname} onNavigate={() => setNavOpen(false)} />
          ))}
        </nav>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button
            ref={openButtonRef}
            type="button"
            className="icon-btn nav-open"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            aria-controls="main-nav"
            onClick={() => setNavOpen(true)}
          >
            <Menu size={20} />
          </button>
          <div className="org">
            <span className="muted small">Organization</span>
            <strong>{org?.name ?? '—'}</strong>
          </div>
          <div className="user">
            <NotificationBell />
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

function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={`nav-link ${active ? 'active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      <Icon size={16} aria-hidden />
      {label}
    </Link>
  );
}

const BELL_POLL_MS = 30_000;

/** Unread count, refreshed every 30s while the tab is visible and on every navigation. */
function NotificationBell() {
  const pathname = usePathname();
  const { data, reload } = useApi<{ count: number }>('/notifications/unread-count');

  useEffect(() => {
    reload();
  }, [pathname, reload]);

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && reload(), BELL_POLL_MS);
    return () => clearInterval(id);
  }, [reload]);

  const count = data?.count ?? 0;
  return (
    <Link
      href="/notifications"
      className="icon-btn bell"
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
    >
      <Bell size={18} aria-hidden />
      {count > 0 && <span className="bell-count">{count > 99 ? '99+' : count}</span>}
    </Link>
  );
}
