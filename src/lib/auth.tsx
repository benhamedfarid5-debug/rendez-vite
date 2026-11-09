import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, setMemoryToken } from './api';

export type AuthUser = { id: string; email: string; full_name: string; role: 'owner' | 'secretary' };
export type AuthPractice = { id: string; slug: string; name_fr: string; name_ar?: string | null; timezone?: string };
export type Permissions = {
  manageAppointments: boolean;
  manageSchedule: boolean;
  manageProfile: boolean;
  manageTeam: boolean;
  manageNotifications: boolean;
  viewAudit: boolean;
  manageDataRequests: boolean;
};

type AuthValue = {
  user: AuthUser | null;
  practice: AuthPractice | null;
  permissions: Permissions | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [practice, setPractice] = useState<AuthPractice | null>(null);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: AuthUser | null; practice: AuthPractice | null; permissions: Permissions | null }>('/api/auth/session');
      setUser(data.user);
      setPractice(data.practice);
      setPermissions(data.permissions);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.code === 'NETWORK')) {
        setUser(null);
        setPractice(null);
        setPermissions(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: AuthUser; practice: AuthPractice; session_token?: string }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    // Repli mémoire si les cookies ne peuvent pas être conservés.
    if (data.session_token) setMemoryToken(data.session_token);
    setUser(data.user);
    setPractice(data.practice);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } finally {
      setMemoryToken(null);
      setUser(null);
      setPractice(null);
      setPermissions(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, practice, permissions, loading, login, logout, refresh }),
    [user, practice, permissions, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return ctx;
}
