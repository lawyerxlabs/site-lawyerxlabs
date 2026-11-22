import { Link } from "react-router-dom"

export function SiteFooter() {
  return (
    <footer className="landing-footer">
      <p>LawyerLab is a Lawtrepreneur product.</p>
      <p>LawyerLab supports professional judgment; it does not replace it.</p>
      <nav className="site-footer-nav" aria-label="Information pages">
        <Link to="/about/">About</Link>
        <Link to="/example/">Before and after</Link>
        <Link to="/faq/">FAQ</Link>
        <Link to="/privacy/">Privacy</Link>
        <Link to="/terms/">Terms</Link>
      </nav>
    </footer>
  )
}
