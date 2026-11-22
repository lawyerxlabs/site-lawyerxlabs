import { Link } from "react-router-dom"

function CompanyShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell">
    <header className="site-header">
      <Link className="brand" to="/" aria-label="LawyerLabs home"><strong>LawyerLabs</strong></Link>
      <nav className="site-nav" aria-label="Primary"><Link to="/products/">Products</Link><Link to="/playground/">Playground</Link></nav>
    </header>
    <main className="landing-main">{children}</main>
    <footer className="landing-footer"><p>LawyerLabs helps bring relevant information into view before people decide.</p><nav className="site-footer-nav" aria-label="Footer"><Link to="/products/">Products</Link><Link to="/playground/">Playground</Link></nav></footer>
  </div>
}

export function CompanyHome() {
  return <CompanyShell><section className="intro"><p className="eyebrow">LawyerLabs</p><h1>Technology that supports better decisions</h1><p className="lede">LawyerLabs gives professionals, educators and organizations access to AI applications and tools that help bring relevant information into view before they decide.</p><h2>Products</h2><ul><li><Link to="/products/">LawyerLab</Link></li><li><Link to="/products/mcp/">Launch MCP</Link></li></ul></section></CompanyShell>
}

export function Products() {
  return <CompanyShell><section className="intro"><h1>Products</h1><ul><li><Link to="/products/">LawyerLab</Link> <span>Status: unknown</span></li><li><Link to="/products/mcp/">Launch MCP</Link> <span>Status: unknown</span></li></ul></section></CompanyShell>
}

export function McpLanding() {
  return <CompanyShell><section className="intro"><h1>Launch MCP</h1><p className="lede">Launch MCP helps connect legal workflows with model context protocol tools. Product details and availability: unknown.</p><Link to="/products/">View products</Link></section></CompanyShell>
}
