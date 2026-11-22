import type { ReactNode } from "react"
import { Header } from "@/components/Header"

type PageLink = { id: string; label: string }

/** Static public page shell: shared header, a titled intro, and a footer. */
export function InfoPage({ eyebrow, title, intro, links, children }: { eyebrow: string; title: string; intro: string; links: PageLink[]; children: ReactNode }) {
  return (
    <div className="app-shell landing-shell info-page">
      <Header />

      <main className="landing-main info-main">
        <section className="landing-hero info-hero" aria-labelledby="page-title">
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="page-title">{title}</h1>
          <p className="lede">{intro}</p>
        </section>

        <nav className="page-nav" aria-label="On this page">
          <span>On this page</span>
          <ul>
            {links.map(({ id, label }) => <li key={id}><a href={`#${id}`}>{label}</a></li>)}
          </ul>
        </nav>

        <div className="info-sections">{children}</div>
      </main>

      <footer className="landing-footer">
        <p>LawyerLab is a Lawtrepreneur product.</p>
        <p>LawyerLab supports professional judgment; it does not replace it.</p>
      </footer>
    </div>
  )
}

export function PageSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="landing-section info-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className="info-section-body">{children}</div>
    </section>
  )
}
