import { useEffect, useRef, type RefObject } from "react"
import { Header } from "@/components/Header"
import { SiteFooter } from "@/components/SiteFooter"
import { FAQ_GROUPS } from "@/lib/faq"

export type PublicPageId = "about" | "faq" | "example" | "privacy" | "terms"

const HEADING: Record<PublicPageId, string> = {
  about: "About LawyerLab",
  faq: "Frequently asked questions",
  example: "Before and after",
  privacy: "Privacy Policy",
  terms: "Terms of Use",
}

const CONTACT = <a href="mailto:hello@lawyerlab.ca">hello@lawyerlab.ca</a>

// Illustrative only. The engine uses one random 8-hex token per document and a running index per entity,
// so the middle code shown here will differ from job to job.
const BEFORE = [
  "Client: Mira Chen",
  "Firm: Northstar Legal Clinic",
  "Email: mira.chen@example.test",
  "Phone: 416-555-0142",
  "Address: 123 Maple Street, Toronto, ON",
  "Court file: CV-26-00012345-0000",
  "Signed by Mira Chen on the date below.",
]
const AFTER = [
  "Client: [PERSON_3F9A0C1E_1]",
  "Firm: [ORGANIZATION_3F9A0C1E_1]",
  "Email: [EMAIL_ADDRESS_3F9A0C1E_1]",
  "Phone: [CA_PHONE_3F9A0C1E_1]",
  "Address: [STREET_ADDRESS_3F9A0C1E_1]",
  "Court file: [CA_COURT_FILE_NUMBER_3F9A0C1E_1]",
  "Signed by [PERSON_3F9A0C1E_1] on the date below.",
]


function Content({ page, headingRef }: { page: PublicPageId; headingRef: RefObject<HTMLHeadingElement | null> }) {
  switch (page) {
    case "about": return <>
      <h1 ref={headingRef} tabIndex={-1}>About LawyerLab</h1>
      <p>LawyerLab is a Lawtrepreneur product. It is an exploration tool for lawyers looking at bounded AI workflows and their risks.</p>
      <p>LawyerLab does not offer implementation services. Lawtrepreneur owns paid strategy and implementation work.</p>
      <p>Questions: {CONTACT}</p>
    </>
    case "faq": return <>
      <h1 ref={headingRef} tabIndex={-1}>Frequently asked questions</h1>
      {FAQ_GROUPS.map((group) => <div key={group.title ?? "main"}>
        {group.title && <h2>{group.title}</h2>}
        {group.items.map(([question, answer]) => <section className="faq-item" key={question}><h3>{question}</h3><p>{answer}</p></section>)}
      </div>)}
    </>
    case "example": return <>
      <h1 ref={headingRef} tabIndex={-1}>Before and after</h1>
      <p className="public-lede">Alias replaces detected personal information with placeholders in a working copy.</p>
      <div className="example-grid">
        <section aria-labelledby="before-title"><h2 id="before-title">Before</h2><pre>{BEFORE.join("\n")}</pre></section>
        <section aria-labelledby="after-title"><h2 id="after-title">After</h2><pre>{AFTER.join("\n")}</pre></section>
      </div>
      <p className="public-note">All names and details are synthetic. The placeholder format is illustrative; the middle code is random per document and will differ from job to job. Scope: detected personal information only, on a best-effort basis. Review the working copy against the original.</p>
    </>
    case "privacy": return <>
      <p className="draft-notice">Draft — under review</p>
      <h1 ref={headingRef} tabIndex={-1}>Privacy Policy</h1>
      <p>LawyerLab is a Lawtrepreneur product. It is not a separate contracting or privacy-policy entity. Questions: {CONTACT}</p>
      <h2>Information you provide</h2>
      <p>You upload one PDF or DOCX file for document preparation. The service also handles the information needed to run your session.</p>
      <h2>How documents are handled</h2>
      <p>Uploaded source files are deleted after processing reaches a terminal state, whether it succeeds or fails.</p>
      <p>Generated results are temporary and are held on the server until they are read, purged, or reach retention expiry. Reading a result does not necessarily remove it immediately.</p>
      <p>If a scanned document needs OCR, it is read by self-hosted OCR that we operate.</p>
      <h2>Abuse prevention</h2>
      <p>Uploads are protected by Cloudflare Turnstile, which runs a background browser check and does not receive your documents. Its use is governed by the <a href="https://www.cloudflare.com/turnstile-privacy-policy/" rel="noopener noreferrer">Cloudflare Turnstile Privacy Addendum</a>.</p>
      <h2>Your responsibility</h2>
      <p>Upload only documents you are authorized to process. Detection and OCR are automated and can miss information or make mistakes. Review the working copy and report against the original before use.</p>
      <h2>Limits of this policy</h2>
      <p>This draft does not address every log, backup, system record, or third-party service. It is under review and may change.</p>
    </>
    case "terms": return <>
      <p className="draft-notice">Draft — under review</p>
      <h1 ref={headingRef} tabIndex={-1}>Terms of Use</h1>
      <p>These terms apply to your use of LawyerLab, a Lawtrepreneur product. Questions: {CONTACT}</p>
      <h2>Use of the service</h2>
      <p>Use LawyerLab only for documents you are authorized to process and in line with your professional obligations. The service applies automated, best-effort detection and may miss or misidentify information.</p>
      <h2>Review before use</h2>
      <p>You remain responsible for reviewing all output against the original and deciding whether it fits your purpose.</p>
      <h2>Changes</h2>
      <p>The service, its limits, and these terms may change while under review.</p>
    </>
  }
}

export function PublicPage({ page }: { page: PublicPageId }) {
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    document.title = `${HEADING[page]} — LawyerLab`
    headingRef.current?.focus()
    return () => { document.title = "LawyerLab" }
  }, [page])

  return <div className="app-shell landing-shell">
    <Header />
    <main className="public-main"><Content page={page} headingRef={headingRef} /></main>
    <SiteFooter />
  </div>
}
