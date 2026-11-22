import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react"

export const NOT_CONFIGURED = "Human verification is not configured. Contact support — uploads are disabled."

type Turnstile = { render: (el: HTMLElement, o: object) => string; remove: (id: string) => void; reset?: (id: string) => void }
const turnstile = () => (window as unknown as { turnstile?: Turnstile }).turnstile

function humanError(message: unknown): string {
  const text = typeof message === "string" ? message : "Human verification failed"
  return `Human verification failed — ${text}`
}

export type HumanVerificationHandle = { reset: () => void }

export type HumanVerificationProps = {
  compact: boolean
  ref?: Ref<HumanVerificationHandle>
  onToken: (token: string) => void
  onError: (message: string) => void
}

// Owns the Turnstile widget and api.js script lifecycle; the owner keeps the token and reports errors.
export function HumanVerification({ compact, ref, onToken, onError }: HumanVerificationProps) {
  // Dev convenience only: the test key always renders but the gateway will reject
  // its tokens. A production build without VITE_TURNSTILE_SITEKEY must fail loudly, not silently use it.
  const sitekey = import.meta.env.VITE_TURNSTILE_SITEKEY ?? (import.meta.env.DEV ? "1x00000000000000000000AA" : "")
  const widgetRef = useRef<HTMLDivElement>(null)
  // Row stays a one-line status until Cloudflare asks the user to interact.
  const [interactive, setInteractive] = useState(false)
  const [verified, setVerified] = useState(false)
  const widgetIdRef = useRef<string | undefined>(undefined)
  // Effect runs once per sitekey; read the latest callbacks through a ref so it never calls stale ones.
  const callbacks = useRef({ onToken, onError })
  callbacks.current = { onToken, onError }

  useImperativeHandle(ref, () => ({
    reset() {
      // Best-effort: a widget reset failure must not drop the owner's captured token and file.
      try {
        if (widgetIdRef.current) turnstile()?.reset?.(widgetIdRef.current)
      } catch {
        // The widget is re-rendered on the next callback; nothing else to undo here.
      }
    },
  }))

  useEffect(() => {
    const container = widgetRef.current
    if (!container) return
    if (!sitekey) {
      callbacks.current.onError(NOT_CONFIGURED)
      return
    }
    const breakpoint = window.matchMedia("(max-width: 420px)")
    let mounted = true
    // Widget callbacks can outlive unmount; drop them once this effect is torn down.
    const live = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => { if (mounted) fn(...args) }
    const removeWidget = () => {
      if (widgetIdRef.current) turnstile()?.remove(widgetIdRef.current)
      widgetIdRef.current = undefined
      callbacks.current.onToken("")
      setVerified(false)
    }
    const renderWidget = () => {
      if (!mounted || !container.isConnected || !turnstile()) return
      removeWidget()
      widgetIdRef.current = turnstile()!.render(container, {
        sitekey,
        action: "tool_parse_upload",
        // Hidden unless Cloudflare needs an interactive challenge.
        appearance: "interaction-only",
        size: compact || breakpoint.matches ? "compact" : "normal",
        "before-interactive-callback": live(() => setInteractive(true)),
        "after-interactive-callback": live(() => setInteractive(false)),
        callback: live((t: string) => { setVerified(true); callbacks.current.onToken(t) }),
        "expired-callback": live(() => {
          setVerified(false)
          callbacks.current.onToken("")
          callbacks.current.onError("Verification expired — refresh it and try again")
        }),
        onerror: live((message: unknown) => {
          callbacks.current.onToken("")
          callbacks.current.onError(humanError(message))
        }),
      })
    }
    const onLoad = live(() => renderWidget())
    const onLoadError = live(() => callbacks.current.onError(NOT_CONFIGURED))
    let loadTarget: HTMLScriptElement | undefined
    if (turnstile()) renderWidget()
    else {
      // A tag left by an earlier mount may have already failed and will never fire load again; replace it.
      document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]')?.remove()
      loadTarget = document.createElement("script")
      loadTarget.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
      loadTarget.async = true
      loadTarget.addEventListener("load", onLoad)
      loadTarget.addEventListener("error", onLoadError)
      document.head.appendChild(loadTarget)
    }
    const onBreakpointChange = () => {
      if (turnstile()) renderWidget()
    }
    breakpoint.addEventListener("change", onBreakpointChange)
    return () => {
      mounted = false
      breakpoint.removeEventListener("change", onBreakpointChange)
      loadTarget?.removeEventListener("load", onLoad)
      loadTarget?.removeEventListener("error", onLoadError)
      removeWidget()
    }
  }, [sitekey])

  const widget = <div ref={widgetRef} />
  return compact ? (
    <div className="verification-compact">{widget}</div>
  ) : (
    <div className={`verification-row${interactive ? "" : " is-quiet"}`}>
      <div>
        <span className="verification-label">Human verification</span>
        <small>{interactive ? "Helps us prevent automated abuse." : verified ? "Verified" : "Verifying…"}</small>
      </div>
      {widget}
    </div>
  )
}
