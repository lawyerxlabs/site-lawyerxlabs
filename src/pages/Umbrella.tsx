import { Link } from "react-router-dom"

function CompanyShell({ children }: { children: React.ReactNode }) {
  return <div className="app-shell"><header className="mobile-bar"><Link className="mobile-brand" to="/"><strong>LawyerLabs</strong></Link><nav><Link to="/products/">Products</Link> · <Link to="/mcp/">MCP</Link></nav></header><main className="main-content">{children}</main><footer>LawyerLabs</footer></div>
}

export function CompanyHome() {
  return <CompanyShell><section className="intro"><p className="eyebrow">LawyerLabs</p><h1>Technology that supports better decisions</h1><p className="lede">LawyerLabs gives professionals, educators and organizations access to AI applications and tools that help bring relevant information into view before they decide.</p><p><Link to="/products/">Explore products</Link></p></section></CompanyShell>
}

export function Products() {
  return <CompanyShell><section className="intro"><h1>Products</h1><ul><li><strong>LawyerLab</strong> <span>Status: unknown</span></li><li><strong>Launch MCP</strong> <span>Status: planned</span></li></ul></section></CompanyShell>
}

export function McpLanding() {
  return <CompanyShell><section className="intro"><h1>Launch MCP</h1><p className="lede">A landing page for MCP tools. Availability: planned.</p><Link to="/products/">View products</Link></section></CompanyShell>
}
