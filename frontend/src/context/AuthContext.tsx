import React, { createContext, useContext, useEffect, useState } from 'react';
import { login as apiLogin, register as apiRegister, getMe, User } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateCurrentUser: (next: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const normalizeUser = (nextUser: User): User => ({
    ...nextUser,
    avatarVersion: nextUser.avatarVersion ?? 0,
  });

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (!accessToken && !refreshToken) {
      setIsLoading(false);
      return;
    }

    getMe()
      .then((u) => setUser(normalizeUser(u)))
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const data = await apiLogin({ username, password });
    localStorage.setItem('accessToken', data.access);
    localStorage.setItem('refreshToken', data.refresh);
    const u = await getMe();
    setUser(normalizeUser(u));
  };

  const handleRegister = async (username: string, email: string, password: string) => {
    await apiRegister({ username, email, password });
    await handleLogin(username, password);
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  const updateCurrentUser = (next: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const avatarChanged = Object.prototype.hasOwnProperty.call(next, "avatar") && next.avatar !== prev.avatar;
      return {
        ...prev,
        ...next,
        avatarVersion: avatarChanged ? Date.now() : (next.avatarVersion ?? prev.avatarVersion ?? 0),
      };
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: isLoading,
        isAuthenticated: !!user,
        login: handleLogin,
        register: handleRegister,
        logout,
        updateCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
};
