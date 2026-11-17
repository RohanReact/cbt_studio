import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setToken, type BillingState, type SessionUser } from './api';
import { clearFileCache, setCacheOwner } from './db';
import { migrateLocalLibrary } from './migrate';
import { clearDocCache } from './pdf/pdfjs';

interface AuthValue {
  user: SessionUser | null;
  billing: BillingState | null;
  loading: boolean;
  offline: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, exams: string[]) => Promise<void>;
  updateExams: (exams: string[]) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refresh = async () => {
    const session = await api.me();
    if (!session.user) setToken(null);
    setUser(session.user);
    setBilling(session.billing);
    setOffline(false);
  };

  const adopt = async (session: { user: SessionUser | null; billing: BillingState | null; token?: string }) => {
    if (session.token) setToken(session.token);
    setUser(session.user);
    setBilling(session.billing);
    setOffline(false);
    if (session.user) {
      const moved = await migrateLocalLibrary();
      if (moved) await refresh();
    }
  };

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const session = await api.me();
        if (cancel) return;
        await adopt(session);
      } catch {
        if (!cancel) setOffline(true);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
    // adopt is stable enough for the first load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCacheOwner(user?.id ?? null);
  }, [user?.id]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      billing,
      loading,
      offline,
      refresh,
      async login(email, password) {
        await adopt(await api.login({ email, password }));
      },
      async signup(name, email, password, exams) {
        await adopt(await api.signup({ name, email, password, exams }));
      },
      async updateExams(exams) {
        const session = await api.updateExams(exams);
        setUser(session.user);
        setBilling(session.billing);
      },
      async logout() {
        try {
          await api.logout();
        } finally {
          setToken(null);
          setUser(null);
          setBilling(null);
          clearDocCache();
          await clearFileCache();
        }
      },
    }),
    [user, billing, loading, offline],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
