import { createContext, useContext, useEffect, useState } from "react";
import { useGetMe } from "@workspace/api-client-react";
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
  const [token, setToken] = useState<string | null>(localStorage.getItem("pharma_token"));
  const [, setLocation] = useLocation();

  // If we have a token, fetch the user.
  const { data: user, isLoading: isUserLoading, isError } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
    } as any
  });

  useEffect(() => {
    if (isError) {
      localStorage.removeItem("pharma_token");
      setToken(null);
    }
  }, [isError]);

  const [userOverride, setUserOverride] = useState<Partial<User> | null>(null);

  const login = (newToken: string) => {
    localStorage.setItem("pharma_token", newToken);
    setToken(newToken);
    setUserOverride(null);
  };

  const logout = () => {
    localStorage.removeItem("pharma_token");
    setToken(null);
    setUserOverride(null);
    setLocation("/login");
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
