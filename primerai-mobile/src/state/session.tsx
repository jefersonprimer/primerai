import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AiProvider } from '@primerai/shared';
import { ApiError, api, getStoredSession, storeSession, type Session } from '@/lib/api';

type Status = 'loading' | 'anon' | 'ready' | 'error';

interface SessionState {
  status: Status;
  session: Session | null;
  providers: AiProvider[];
  error: string | null;
  /** true quando o usuário não tem nenhum provider de IA: aí o modal trava a tela */
  needsProvider: boolean;
  dismissProviderGate: () => void;
  refresh: () => Promise<void>;
  refreshProviders: () => Promise<void>;
  removeProvider: (providerId: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [gateDismissed, setGateDismissed] = useState(false);

  const loadProviders = useCallback(async (active: Session) => {
    const list = await api.listProviders(active.accessToken);
    setProviders(list);
    return list;
  }, []);

  const load = useCallback(async () => {
    try {
      const stored = await getStoredSession();
      if (!stored) {
        setSession(null);
        setProviders([]);
        setStatus('anon');
        return;
      }

      const me = await api.me(stored.accessToken);
      setSession({ ...stored, user: me.user });
      await loadProviders(stored);
      setError(null);
      setStatus('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await storeSession(null);
        setSession(null);
        setStatus('anon');
        return;
      }
      setError(err instanceof ApiError ? err.message : 'não foi possível conectar');
      setStatus('error');
    }
  }, [loadProviders]);

  const refresh = useCallback(async () => {
    setStatus('loading');
    await load();
  }, [load]);

  const refreshProviders = useCallback(async () => {
    if (!session) return;
    const list = await api.listProviders(session.accessToken);
    setProviders(list);
    setError(null);
  }, [session]);

  const removeProvider = useCallback((providerId: string) => {
    setProviders((current) => current.filter((provider) => provider.id !== providerId));
  }, []);

  useEffect(() => {
    let cancelled = false;

    // o await inicial garante que nenhum setState rola no corpo do effect
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  const login = useCallback(
    async (email: string, password: string) => {
      setStatus('loading');
      try {
        const next = await api.login({ email, password });
        setSession(next);
        await loadProviders(next);
        setGateDismissed(false);
        setStatus('ready');
      } catch (err) {
        setStatus('anon');
        throw err;
      }
    },
    [loadProviders],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      setStatus('loading');
      try {
        const next = await api.register({ email, password }, name);
        setSession(next);
        await loadProviders(next);
        setGateDismissed(false);
        setStatus('ready');
      } catch (err) {
        setStatus('anon');
        throw err;
      }
    },
    [loadProviders],
  );

  const logout = useCallback(async () => {
    if (session) await api.logout(session.accessToken).catch(() => undefined);
    setSession(null);
    setProviders([]);
    setGateDismissed(false);
    setStatus('anon');
  }, [session]);

  const value = useMemo<SessionState>(
    () => ({
      status,
      session,
      providers,
      error,
      needsProvider: status === 'ready' && providers.length === 0 && !gateDismissed,
      dismissProviderGate: () => setGateDismissed(true),
      refresh,
      refreshProviders,
      removeProvider,
      login,
      register,
      logout,
    }),
    [status, session, providers, error, gateDismissed, refresh, refreshProviders, removeProvider, login, register, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession precisa estar dentro de <SessionProvider>');
  return ctx;
}
