"use client"

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react"
import { apiSend, useApi } from "@/lib/client/api"

export interface SessionUser {
  id: string
  name: string
  email: string
  roles: string[]
  department: string
  scope: string
  mfaEnrolled: boolean
}

export interface SessionPayload {
  user: SessionUser
  permissions: string[]
  roleDefinitions: { id: string; name: string; description: string; permissions: string[] }[]
  session: { expiresAt: string; idleTimeoutMinutes: number; mfa: boolean }
  directory: { id: string; name: string; roles: string[]; department: string; scope: string }[]
}

interface SessionContextValue extends Partial<SessionPayload> {
  loading: boolean
  can: (permission: string) => boolean
  switchUser: (userId: string) => Promise<void>
  reload: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue>({
  loading: true,
  can: () => false,
  switchUser: async () => {},
  reload: async () => {},
})

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, loading, reload } = useApi<SessionPayload>("/api/session")

  const switchUser = useCallback(
    async (userId: string) => {
      await apiSend("/api/session", "POST", { userId })
      // Full reload so every server-rendered projection re-evaluates for the
      // new identity; permissions are never re-derived on the client.
      window.location.reload()
    },
    [],
  )

  const value = useMemo<SessionContextValue>(
    () => ({
      ...data,
      loading,
      can: (permission: string) => Boolean(data?.permissions.includes(permission)),
      switchUser,
      reload,
    }),
    [data, loading, switchUser, reload],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext)
}
