import type { ReactElement } from 'react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useGetMe, useLoginUser } from '@workspace/api-client-react'
import type { User } from '@workspace/api-client-react'
import { getToken, setToken as persistToken, notifyLogout } from '../lib/apiClient'
import { rememberEmail, clearRecallEmails } from '../lib/emailRecall'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  loginError: string | null
  login: (email: string, password: string) => Promise<void>
  // Used by the first-run setup screen, which receives a token directly
  // from the register response instead of doing a second login round-trip.
  loginWithToken: (token: string) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }): ReactElement {
  const [token, setToken] = useState<string | null>(() => getToken())
  const tokenRef = useRef<string | null>(token)
  const [loginError, setLoginError] = useState<string | null>(null)

  const { data: user, isLoading: isUserLoading, isError } = useGetMe({
    query: { enabled: !!token, retry: false }
  } as any)

  const loginMutation = useLoginUser()

  useEffect(() => {
    // Token became invalid (expired/revoked server-side) — drop the session.
    if (isError) {
      tokenRef.current = null
      persistToken(null)
      setToken(null)
    }
  }, [isError])

  const login = async (email: string, password: string): Promise<void> => {
    setLoginError(null)
    try {
      const result = await loginMutation.mutateAsync({ data: { email, password } } as any)
      const newToken = (result as any).token as string
      tokenRef.current = newToken
      persistToken(newToken)
      setToken(newToken)
      rememberEmail(email)
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed')
      throw err
    }
  }

  const logout = (): void => {
    notifyLogout()
    // Don't leave a trail of previously-used staff emails on a shared terminal
    // after a deliberate sign-out.
    clearRecallEmails()
    tokenRef.current = null
    persistToken(null)
    setToken(null)
  }

  const loginWithToken = (newToken: string): void => {
    setLoginError(null)
    tokenRef.current = newToken
    persistToken(newToken)
    setToken(newToken)
  }

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: !!token && isUserLoading,
        isAuthenticated: !!token && !!user,
        loginError,
        login,
        loginWithToken,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
