import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: 'owner' | 'manager' | 'cashier';
  shopId: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  createShop: (data: { shopName: string; ownerName: string; ownerEmail: string; password: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]     = useState<AuthUser | null>(null);
  const [token, setToken]   = useState<string | null>(() => localStorage.getItem('pos_token'));
  const [loading, setLoading] = useState(true);

  // On mount, validate stored token and listen for global 401s
  useEffect(() => {
    const handleUnauthorized = () => {
      localStorage.removeItem('pos_token');
      setToken(null);
      setUser(null);
    };
    window.addEventListener('unauthorized_api', handleUnauthorized);

    if (!token) { setLoading(false); return; }
    api.get<AuthUser>('/auth/me')
      .then(setUser)
      .catch(() => {
        handleUnauthorized();
      })
      .finally(() => setLoading(false));

    return () => window.removeEventListener('unauthorized_api', handleUnauthorized);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function login(username: string, password: string) {
    const data = await api.post<{ token: string; user: AuthUser }>(
      '/auth/login',
      { username, password }
    );
    localStorage.setItem('pos_token', data.token);
    setToken(data.token);
    setUser(data.user);
  }

  async function createShop(data: { shopName: string; ownerName: string; ownerEmail: string; password: string }) {
    const result = await api.post<{ token: string; user: AuthUser }>('/auth/create-shop', data);
    localStorage.setItem('pos_token', result.token);
    setToken(result.token);
    setUser(result.user);
  }

  function logout() {
    localStorage.removeItem('pos_token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, createShop, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
