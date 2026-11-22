import { useEffect } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { surface } from "@/surface"

function safeReturnTo(value: string | null) {
  return value && value.length <= 2048 && /^\/(?![/\\])[\x21-\x7e]*$/.test(value) ? value : "/playground/"
}

function modeLink(path: string, returnTo: string, hasReturnTo: boolean) {
  return hasReturnTo ? `${path}${path.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent(returnTo)}` : path
}

export function Login() {
  const [params] = useSearchParams()
  const register = params.get("mode") === "register"
  const suppliedReturnTo = params.get("returnTo")
  const returnTo = safeReturnTo(suppliedReturnTo)
  const invalidEmail = params.get("error") === "invalid-email"
  const heading = register ? `Join the ${surface.name} waitlist` : `Sign in to ${surface.name}`

  useEffect(() => {
    document.title = `${register ? "Join Waitlist" : "Sign in"} — ${surface.name}`
    return () => { document.title = surface.name }
  }, [register])

  return (
    <main className="auth-main">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="auth-brand" to="/" aria-label={`${surface.name} home`}>
          <img className="brand-mark" src={surface.icon} alt="" aria-hidden="true" />
          <strong>{surface.name}</strong>
        </Link>
        <div className="auth-copy">
          <h1 id="auth-title">{heading}</h1>
          <p>{register
            ? `Verify your email to create a ${surface.name} identity and request access. Joining the waitlist does not grant access or guarantee an invitation.`
            : "Enter your email and we’ll send you a passwordless verification code."}</p>
        </div>
        <form className="auth-form" method="post" action="/api/auth/login" aria-label={heading}>
          <input type="hidden" name="intent" value={register ? "register" : "sign-in"} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="auth-field">
            <label htmlFor="auth-email">Email</label>
            <input
              className="ll-input"
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={invalidEmail || undefined}
              aria-describedby={invalidEmail ? "email-error" : undefined}
            />
            {invalidEmail && <p className="auth-error" id="email-error" role="alert">Enter a valid email address.</p>}
          </div>
          <Button type="submit">{register ? "Join Waitlist" : "Continue with email"}</Button>
        </form>
        <p className="auth-switch">{register ? <>
          Already have an account? <Link to={modeLink("/login/", returnTo, suppliedReturnTo === returnTo)}>Sign in</Link>
        </> : <>
          Don&apos;t have an account? <a href={surface.waitlistUrl}>Join Waitlist</a>
        </>}</p>
      </section>
    </main>
  )
}

export function AccessPending() {
  useEffect(() => {
    document.title = `Access pending — ${surface.name}`
    return () => { document.title = surface.name }
  }, [])
  return (
    <main className="auth-main">
      <section className="auth-card" aria-labelledby="pending-title">
        <Link className="auth-brand" to="/" aria-label={`${surface.name} home`}>
          <img className="brand-mark" src={surface.icon} alt="" aria-hidden="true" />
          <strong>{surface.name}</strong>
        </Link>
        <div className="auth-copy">
          <h1 id="pending-title">Your access request is pending</h1>
          <p>Your email has been verified, but {surface.name} access has not been enabled. Your request is on our waitlist; this does not guarantee access or an invitation.</p>
        </div>
        <div className="auth-actions">
          <Button asChild><Link to="/">Return home</Link></Button>
          <Link to="/login/">Sign in again</Link>
        </div>
      </section>
    </main>
  )
}
