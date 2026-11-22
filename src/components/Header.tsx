import { LogIn, MailPlus, UserRound } from "lucide-react"
import { Link, NavLink } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { identityLabel } from "@/lib/api"
import { useTier } from "@/lib/useTier"
import { surface } from "@/surface"

export function Header({ hideAccountAction = false }: { hideAccountAction?: boolean }) {
  const { signedIn, identity, login, logout } = useTier()
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label={`${surface.name} home`}>
        <img className="brand-mark" src={surface.icon} alt="" aria-hidden="true" />
        <strong>{surface.name}</strong>
      </a>

      <nav className="site-nav" aria-label="Primary">
        <NavLink to="/commitments/">Our commitments</NavLink>
        <NavLink to="/work-with-us/">Work with us</NavLink>
      </nav>

      <div className="header-actions" aria-label="Playground, account, and updates">
        <Button asChild variant="secondary" size="sm">
          <Link to="/playground/">Open Playground</Link>
        </Button>
        {!hideAccountAction && (signedIn ? (
          <Button variant="ghost" size="sm" onClick={() => void logout()} title={identityLabel(identity)}>
            <UserRound size={16} aria-hidden="true" />
            <span className="header-action-label">Sign out</span>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={login}>
            <LogIn size={16} aria-hidden="true" />
            <span className="header-action-label">Sign in</span>
          </Button>
        ))}
        <Button asChild variant={hideAccountAction ? "secondary" : "primary"} size="sm" className={hideAccountAction ? "header-waitlist-landing" : undefined}>
          <a href={surface.waitlistUrl}>
            <MailPlus size={16} aria-hidden="true" />
            <span className="header-action-label">Join Waitlist</span>
          </a>
        </Button>
      </div>
    </header>
  )
}
