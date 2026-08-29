import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  branchScope,
  onSessionExpired,
  tokens,
  type Me,
  type Role,
  type Session,
} from './api';

interface AuthValue {
  user: Me | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<Me>;
  signOut: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    if (!tokens.access) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.get<Me>('/auth/me'));
    } catch {
      tokens.clear();
      setUser(null);
    }
  }, []);

  // Al abrir la app hay token en el navegador pero no perfil: se recupera de
  // la API en lugar de guardarlo en local, para que un cambio de rol o una
  // baja tengan efecto inmediato.
  useEffect(() => {
    void loadUser().finally(() => setLoading(false));
  }, [loadUser]);

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => setUser(null));
    return () => {
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      async signIn(email, password) {
        const session = await api.post<Session>('/auth/login', { email, password });
        tokens.set(session.accessToken, session.refreshToken);
        const me = await api.get<Me>('/auth/me');
        setUser(me);
        return me;
      },
      async signOut() {
        const refresh = tokens.refresh;
        if (refresh) await api.post('/auth/logout', { refreshToken: refresh }).catch(() => {});
        tokens.clear();
        // Igual que los tokens: la sede elegida se va con la sesion.
        branchScope.set(null);
        setUser(null);
      },
      async changePassword(currentPassword, newPassword) {
        await api.post('/auth/change-password', { currentPassword, newPassword });
        // Cambiar la clave revoca el resto de sesiones, incluida esta: hay que
        // volver a entrar con la nueva.
        tokens.clear();
        setUser(null);
      },
      refreshUser: loadUser,
      can: (...roles) => (user ? roles.includes(user.role) : false),
    }),
    [user, loading, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
