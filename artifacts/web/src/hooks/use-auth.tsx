import { createContext, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import type { User } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: () => void;
  logout: () => void;
  updateUser: (updated: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // The session is an httpOnly, Secure, SameSite=Lax cookie that the API sets
  // on register/login (artifacts/api-server/src/lib/auth-cookies.ts). It is
  // invisible to page JavaScript, so the bearer token never touched
  // localStorage and no Authorization header is attached from the browser —
  // the cookie rides along on same-origin /api calls by itself. This removes
  // the audit finding that an XSS could read the pilot's persisted token.
  const queryClient = useQueryClient();
  const [userOverride, setUserOverride] = useState<Partial<User> | null>(null);

  // Always enabled: the browser presents the session cookie on /auth/me; a
  // logged-out visitor simply gets an (unretried) 401 and is shown the login
  // screen. A cookie-based session can't be detected synchronously, so there
  // is no token state to gate the query on.
  const { data: user, isLoading: isUserLoading } = useGetMe({
    query: {
      enabled: true,
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  const login = () => {
    setUserOverride(null);
    // The login/register response just set the httpOnly cookie; refetch the
    // profile now that the browser holds a session.
    queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Offline — the cookie is cleared server-side on the next successful
      // call; the redirect below still leaves the app immediately.
    }
    setUserOverride(null);
    // Full page redirect clears all in-memory React Query cache and component state
    window.location.replace("/login");
  };

  const updateUser = (updated: Partial<User>) => {
    setUserOverride((prev) => ({ ...prev, ...updated }));
  };

  const mergedUser = user ? { ...user, ...userOverride } : null;

  return (
    <AuthContext.Provider value={{ user: mergedUser, isLoading: isUserLoading, login, logout, updateUser }}>
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