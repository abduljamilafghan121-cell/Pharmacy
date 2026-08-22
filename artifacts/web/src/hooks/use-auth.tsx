import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useGetMe, setAuthTokenGetter } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
  updateUser: (updated: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try { return localStorage.getItem("pharma_token"); } catch { return null; }
  });
  // Keep a ref so the auth getter always has the latest token, even if
  // localStorage is blocked (e.g. an embedded/sandboxed preview iframe).
  const tokenRef = useRef<string | null>(token);
  const [, setLocation] = useLocation();

  // Wire the API client's bearer-token getter to this ref.
  // This replaces the localStorage-only getter set in main.tsx so that
  // freshly-logged-in tokens (held in React state) are always sent.
  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
    return () => setAuthTokenGetter(null);
  }, []);

  // If we have a token, fetch the user.
  const { data: user, isLoading: isUserLoading, isError } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
    } as any
  });

  useEffect(() => {
    if (isError) {
      try { localStorage.removeItem("pharma_token"); } catch { /* sandboxed */ }
      tokenRef.current = null;
      setToken(null);
    }
  }, [isError]);

  const [userOverride, setUserOverride] = useState<Partial<User> | null>(null);

  const login = (newToken: string) => {
    try { localStorage.setItem("pharma_token", newToken); } catch { /* sandboxed */ }
    tokenRef.current = newToken;
    setToken(newToken);
    setUserOverride(null);
  };

  const logout = () => {
    try { localStorage.removeItem("pharma_token"); } catch { /* sandboxed */ }
    tokenRef.current = null;
    setToken(null);
    setUserOverride(null);
    // Full page redirect clears all in-memory React Query cache and component state
    window.location.replace("/login");
  };

  const updateUser = (updated: Partial<User>) => {
    setUserOverride((prev) => ({ ...prev, ...updated }));
  };

  const mergedUser = user ? { ...user, ...userOverride } : null;

  return (
    <AuthContext.Provider value={{ user: mergedUser, isLoading: !!token && isUserLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
