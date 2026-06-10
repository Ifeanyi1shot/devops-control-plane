import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export interface AuthUser {
  login: string
  name: string
  avatarUrl: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: () => {},
})

const TOKEN_KEY = 'dcp_auth_token'

function parseToken(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as {
      login: string; name: string; avatarUrl: string; role: string; exp: number
    }
    if (payload.exp * 1000 < Date.now()) return null
    return { login: payload.login, name: payload.name, avatarUrl: payload.avatarUrl, role: payload.role }
  } catch {
    return null
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function storeToken(token: string): AuthUser | null {
  const user = parseToken(token)
  if (user) localStorage.setItem(TOKEN_KEY, token)
  return user
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      const parsed = parseToken(token)
      setUser(parsed)
      if (!parsed) localStorage.removeItem(TOKEN_KEY)
    }
    setLoading(false)
  }, [])

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
