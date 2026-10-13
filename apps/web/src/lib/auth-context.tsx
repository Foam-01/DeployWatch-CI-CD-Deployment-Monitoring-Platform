'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken } from './api';
import type { Me, MemberRole } from '@/types/api';

interface AuthState {
  user: Me | null;
  role: MemberRole | null;
  /** Active organization (MVP: the first membership). */
  orgId: string | null;
  loading: boolean;
  canWrite: boolean;
  canManageIntegrations: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const res = await api.get<Me>('/auth/me');
    setUser(res.data);
  }, []);

  useEffect(() => {
    // Restore the session from the refresh cookie on first load.
    (async () => {
      try {
        if (await refreshSession()) await loadMe();
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ accessToken: string }>('/auth/login', { email, password });
      setAccessToken(res.data.accessToken);
      await loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await api.post<{ accessToken: string }>('/auth/register', { name, email, password });
      setAccessToken(res.data.accessToken);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  // MVP: one organization per workspace — the first membership is the active one.
  // These flags only shape the UI; the API enforces the same rules.
  const role = user?.memberships[0]?.role ?? null;
  const orgId = user?.memberships[0]?.organization.id ?? null;
  const canWrite = role !== null && role !== 'VIEWER';
  const canManageIntegrations = role === 'OWNER' || role === 'ADMIN';

  return (
    <AuthContext.Provider
      value={{ user, role, orgId, loading, canWrite, canManageIntegrations, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
