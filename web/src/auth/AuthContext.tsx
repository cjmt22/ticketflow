import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from '../api/auth';
import { refreshSession, setSessionExpiredHandler } from '../api/client';
import type { RegisterInput, User } from '../api/types';

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User };

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  registerOrganisation: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Restore the session on page load: the refresh cookie survives a reload, the access token does not.
  useEffect(() => {
    let cancelled = false;
    setSessionExpiredHandler(() => setState({ status: 'anonymous' }));

    refreshSession()
      .then((result) => {
        if (cancelled) return;
        setState(
          result
            ? { status: 'authenticated', user: result.user }
            : { status: 'anonymous' },
        );
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'anonymous' });
      });

    return () => {
      cancelled = true;
      setSessionExpiredHandler(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password);
    setState({ status: 'authenticated', user: result.user });
  }, []);

  const registerOrganisation = useCallback(async (input: RegisterInput) => {
    const result = await authApi.registerOrganisation(input);
    setState({ status: 'authenticated', user: result.user });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setState({ status: 'anonymous' });
    }
  }, []);

  const value = useMemo(
    () => ({ state, login, registerOrganisation, logout }),
    [state, login, registerOrganisation, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}