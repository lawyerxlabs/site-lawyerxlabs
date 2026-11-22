import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { getMe, getSession, type Identity, type Me } from "@/lib/api"

export type TierState = {
  me: Me | null
  signedIn: boolean
  identity: Identity | null
  ready: boolean
  refreshMe: () => Promise<void>
  login: () => void
  logout: () => void
}

// Per API-CONTRACT-v2: fetch /v1/me on mount, fail gracefully to guest with unknown limits.
// `ready` stays false until the first refresh settles, so gates never decide signed-out before auth resolves.
function useTierState(): TierState {
  const [me, setMe] = useState<Me | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [ready, setReady] = useState(false)
  const signedIn = identity !== null

  // Logout invalidates all in-flight refreshes; request order separately protects concurrent refreshes.
  const generation = useRef(0)
  const requestOrder = useRef(0)
  const refresh = useCallback(async () => {
    const current = generation.current
    const request = ++requestOrder.current
    const session = await getSession()
    if (current !== generation.current || request !== requestOrder.current) return
    setReady(true)
    setIdentity(session)
    const profile = await getMe()
    if (current !== generation.current || request !== requestOrder.current) return
    setMe(profile)
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const login = () => { window.location.href = `/login/?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}` }
  const logout = useCallback(() => {
    // Gate immediately: protected flows unmount before any further request can fire.
    generation.current++
    setMe(null)
    setIdentity(null)
    window.location.href = "/api/auth/logout"
  }, [])

  return { me, signedIn, identity, ready, refreshMe: refresh, login, logout }
}

// One auth owner per app tree: every consumer reads the same state, so a logout gates all mounted flows at once.
const TierContext = createContext<TierState | null>(null)

export function TierProvider({ children }: { children: ReactNode }) {
  return createElement(TierContext.Provider, { value: useTierState() }, children)
}

export function useTier(): TierState {
  const state = useContext(TierContext)
  if (!state) throw new Error("useTier must be used inside TierProvider")
  return state
}
