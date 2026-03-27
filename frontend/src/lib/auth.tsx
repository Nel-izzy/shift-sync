'use client';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { authApi, setAuthInitialized } from './api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'manager' | 'staff';
  skills: string[];
  desiredHoursPerWeek: number;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!stored) {
      // No token at all — not logged in, stop loading immediately
      setLoading(false);
      return;
    }

    if (storedUser) {
      // Optimistically set user from cache so the UI doesn't flash
      setToken(stored);
      setUser(JSON.parse(storedUser));
    }

    // Verify the token is still valid against the API
    authApi.me()
      .then((freshUser) => {
        setToken(stored);
        setUser(freshUser);
        localStorage.setItem('user', JSON.stringify(freshUser));
      })
      .catch(() => {
        // Token is expired or invalid — clear everything
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      })
      .finally(() => {
        // Signal to the axios interceptor that initial auth verification is
        // complete. Any 401s that arrive after this point are genuinely stale
        // tokens and should trigger a redirect — not initialization noise.
        setAuthInitialized();
        setLoading(false);
      });
  }, []);

  const login = async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    // Persist before updating state so the axios interceptor
    // has the token available for any requests that fire immediately after
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
