import { ProcessingState } from "@/components/ProcessingState"
import { Fragment, useState } from "react"
import { CheckCircle2, FileCheck2, MinusCircle, ShieldCheck, UserCheck } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { FileIntake } from "@/components/FileIntake"
import { Header } from "@/components/Header"
import { SiteFooter } from "@/components/SiteFooter"
import { WaitlistForm } from "@/components/WaitlistForm"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { FAQ_GROUPS } from "@/lib/faq"
import { setSource } from "@/lib/sourceStore"
import { useWorkflowJob } from "@/lib/useWorkflowJob"
import { getAliasWorkflow } from "@/lib/workflows"
import { useResolvedWorkflow } from "@/lib/useWorkflowCapabilities"

// Real tool output — each [original, alias] pair is what the engine detected and replaced.
// Misses and over-matches are intentional; they support "review every result".
type Seg = string | [original: string, alias: string]

// Email — from synthetic-email.pdf run. Surnames kept; "project"/"Project" over-matched.
const p = (n: number | string) => `[PERSON_B2A7F3BB_${n}]`
const EMAIL: Seg[][] = [
  ["From: ", ["Mira", p(1)], " Vale <", ["mira@example.invalid", "[EMAIL_ADDRESS_B2A7F3BB_7]"], ">"],
  ["To: ", ["Rowan", p(3)], " Pike <", ["rowan@example.invalid", "[EMAIL_ADDRESS_B2A7F3BB_5]"], ">"],
  ["Date: October 24, 2026"],
  ["Subject: Paper Lantern ", ["project", p(4)], " kickoff"],
  [],
  ["Hello ", ["Rowan", p(3)], ","],
  [],
  ["Please confirm our fictional kickoff meeting for November 3 at 10:30 a.m."],
  [["Project", p(2)], " code: DEMO-4817. Please reply to this sample message with any test redactions needed."],
  [],
  ["Thanks,"],
  [["Mira", p(1)]],
]

// Lease — Ontario commercial lease template filled with synthetic parties, run through the engine.
// "Address" over-matched as PERSON_14; street numbers split from street names as separate entity types.
const q = (n: number) => `[PERSON_179A6A95_${n}]`
const LEASE: Seg[][] = [
  ["SIMPLIFIED COMMERCIAL LEASE AGREEMENT"],
  ["Ontario template — obtain independent legal advice before signing"],
  [],
  ["This Commercial Lease Agreement (the \"Lease\") is made as of October 24, 2026."],
  [],
  ["Landlord: ", ["Northstar Quillworks Ltd", "[ORGANIZATION_179A6A95_3]"], "."],
  [["Address", q(14)], " for notices: ", ["42", "[STREET_ADDRESS_179A6A95_13]"], " ", ["Imaginary Crescent, Cloudberry, ON K0K 0K0", "[CA_POSTAL_CODE_179A6A95_12]"]],
  [],
  ["Tenant: ", ["Rowan Pike\nAddress", q(11)], " for notices: ", ["9", "[STREET_ADDRESS_179A6A95_10]"], " ", ["Fictional Way, Sampleton, ON A1A 1A1", "[CA_POSTAL_CODE_179A6A95_9]"]],
  [],
  ["Premises: The commercial premises at ", ["200 Invented Street, Suite 400, Cloudberry, Ontario", "[STREET_ADDRESS_179A6A95_8]"], ", including parking: 2 surface stalls."],
  [],
  ["Permitted Use: General office and editorial design studio."],
  [],
  ["Term: From November 1, 2026 (the \"Commencement Date\") to October 31, 2028 (the \"Expiry Date\")."],
  [],
  ["Base Rent: $3,200 per month, plus HST if applicable, payable on the 1st day of each month."],
  [],
  ["Security Deposit: $6,400, to be held and applied as set out below."],
  [],
  ["Landlord contact: ", ["mira.vale@northstarquillworks.example.invalid", "[EMAIL_ADDRESS_179A6A95_7]"], ", ", ["416-555-0142", "[CA_PHONE_179A6A95_6]"]],
  ["Tenant contact: ", ["rowan.pike@example.invalid", "[EMAIL_ADDRESS_179A6A95_5]"], ", ", ["647-555-0187", "[CA_PHONE_179A6A95_4]"]],
  [],
  ["Signed this 24th day of October, 2026."],
  [],
  ["LANDLORD: ", ["Northstar Quillworks Ltd", "[ORGANIZATION_179A6A95_3]"], ". by its authorized signatory ", ["Mira Vale", q(2)]],
  ["TENANT: ", ["Rowan Pike", q(1)]],
]

// Invoice — synthetic invoice from synthetic-invoice.pdf run through the engine.
// "Bill" in "Bill to:" over-matched as PERSON_4.
const r = (n: number) => `[PERSON_4FCCE5F1_${n}]`
const INVOICE: Seg[][] = [
  ["FICTIONAL SAMPLE INVOICE"],
  ["Invoice: INV-DEMO-2048"],
  ["Issue date: October 24, 2026"],
  ["Due date: November 8, 2026"],
  ["From: ", ["Northstar Quillworks Ltd", "[ORGANIZATION_4FCCE5F1_7]"], ", ", ["42", "[STREET_ADDRESS_4FCCE5F1_6]"], " ", ["Imaginary Crescent, Cloudberry, ON K0K 0K0", "[CA_POSTAL_CODE_4FCCE5F1_5]"]],
  [["Bill", r(4)], " to: ", ["Rowan Pike", r(3)], ", ", ["9", "[STREET_ADDRESS_4FCCE5F1_2]"], " ", ["Fictional Way, Sampleton, ON A1A 1A1", "[CA_POSTAL_CODE_4FCCE5F1_1]"]],
  ["Description: Paper Lantern editorial design - 5 hours @ CAD $250.00"],
  ["Subtotal: CAD $1,250.00"],
  ["HST (13%): CAD $162.50"],
  ["Total due: CAD $1,412.50"],
  ["Payment reference: TEST-ONLY-7731"],
]

const SAMPLES = [
  { id: "email", label: "Email", data: EMAIL },
  { id: "lease", label: "Agreement", data: LEASE },
  { id: "invoice", label: "Invoice", data: INVOICE },
] as const

// Not published, per docs/TRUST-CLAIMS.md excluded claims: "no AI" detection, immediate deletion,
// "no server copy" (results are server-held until read/purged/expiry), "browser-only" output, Presidio location.
export function Landing() {
  const [showAliased, setShowAliased] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { submit, busy, error } = useWorkflowJob()
  const docalias = useResolvedWorkflow(getAliasWorkflow())

  // Same hand-off as the Playground: upload, keep the source for preview, open the job page.
  async function handleSubmit(file: File, token: string) {
    const job = await submit(file, token)
    if (!job) return
    setSource(job.job_id, file)
    navigate(`/playground/jobs/${job.job_id}`)
  }

  return (
    <div className="app-shell landing-shell">
      <Header hideAccountAction />

      <main className="landing-main">
        <div className="landing-top">
          <section className="landing-hero" aria-labelledby="landing-title">
            <h1 id="landing-title">Explore how to integrate AI into your practice—<strong>before you build around it</strong>.</h1>
            <p className="landing-sub">One workflow at a time.</p>
            <p className="landing-desc">Upload a document and get a working copy with detected personal details aliased, plus a report of what was replaced. Then you check it and decide what to use.</p>
            <div className="landing-cta">
              <Button asChild size="default"><Link to="/playground/">Open playground</Link></Button>
              <p className="landing-cta-note">Free to try. No account needed.</p>
            </div>
          </section>

          <section className="alias-box" id="document-alias" aria-label="Upload a document to alias detected details">
            {error && <Alert><p>{error}</p></Alert>}
            {busy && <ProcessingState focusOnMount message="Uploading document…" />}
            <div hidden={busy}><FileIntake
              samples={docalias?.samples ?? []}
              inputModes={docalias?.inputModes ?? []}
              acceptedFileTypes={docalias?.acceptedFileTypes}
              busy={busy}
              onSubmit={handleSubmit}
              compact
              note={<>
                <p className="alias-warning">Automated detection can miss things. Removing names doesn't hide a case's facts. Check the copy against your original.</p>
              </>}
            /></div>
          </section>
        </div>

        <aside className="trust-band" aria-label="Trust summary">
          <ul className="trust-band-labels">
            <li><FileCheck2 size={17} aria-hidden="true" />Detected details aliased</li>
            <li><ShieldCheck size={17} aria-hidden="true" />Source files deleted after processing</li>
            <li><UserCheck size={17} aria-hidden="true" />You review every result</li>
            <li><Link to="/commitments/">Our commitments →</Link></li>
          </ul>
        </aside>

        <section className="landing-section landing-pas" aria-labelledby="pas-problem-title">
          <div className="pas-problem">
            <h2 id="pas-problem-title">Learning how to use AI in legal practice should not begin with a live client matter.</h2>
            <p className="landing-intro">Most lawyers have no structured way to learn where AI fits into their work.</p>
            <p className="pas-label">The learning gap</p>
            <p className="landing-intro">Without practical training, the choice can feel like experimenting with client information or avoiding useful tools altogether.</p>
            <p className="landing-intro"><strong>Your professional duties do not change when AI is involved.</strong></p>
          </div>
          <div className="pas-questions">
            <h3>Questions to ask before using AI in legal practice</h3>
            <p className="landing-intro">Before choosing a tool, consider the work, the information involved, and the judgment the workflow still requires.</p>
            <ul className="pas-prompts">
              <li>What <strong>task</strong> are you asking AI to perform?</li>
              <li>What are the <strong>risks</strong> of giving AI this information?</li>
              <li>How will you <strong>identify</strong> errors made by AI?</li>
              <li>What <strong>judgment</strong> can you not delegate to AI?</li>
            </ul>
          </div>
          <div className="pas-solution">
            <p className="eyebrow">Introducing DocAliaser</p>
            <h3>A bounded workflow to experiment with redacting documents before deciding to use AI for a task.</h3>
            <ol className="landing-steps">
              <li><span className="landing-step-num" aria-hidden="true">01</span><div className="landing-step-body"><p className="landing-step-role">INPUT</p><h3>Source document</h3><p>Upload one PDF or DOCX.</p></div></li>
              <li><span className="landing-step-num" aria-hidden="true">02</span><div className="landing-step-body"><p className="landing-step-role">TOOL OUTPUT</p><h3>Aliased copy + report</h3><p>LawyerLab replaces detected details and shows what changed.</p></div></li>
              <li><span className="landing-step-num" aria-hidden="true">03</span><div className="landing-step-body"><p className="landing-step-role">HUMAN DECISION</p><h3>Your review and decision</h3><p>Compare the result with the original before deciding what to use.</p></div></li>
            </ol>
            <div className="landing-cta pas-solution-cta">
              <Button asChild><Link to="/playground/">Start Playground</Link></Button>
              <p className="landing-cta-note">Try Document Alias or explore another bounded workflow.</p>
            </div>
          </div>
        </section>

        <section className="landing-section landing-band" aria-labelledby="sample-title">
          <h2 id="sample-title">Check the output, not the promise</h2>
          <p className="landing-intro">These synthetic documents show what was replaced and what was left behind. All names are invented.</p>
          <Tabs defaultValue="email">
            <TabsList aria-label="Sample document">
              {SAMPLES.map((s) => <TabsTrigger key={s.id} value={s.id}>{s.label}</TabsTrigger>)}
            </TabsList>
            {SAMPLES.map((s) => (
              <TabsContent key={s.id} value={s.id}>
                <figure className={`landing-sample${showAliased ? " landing-sample--aliased" : ""}`}>
                  <figcaption>{showAliased ? "Detected personal details are replaced with placeholders." : "Dashed boxes mark what the tool replaces."}</figcaption>
                  <pre>
                    {s.data.map((line, i) => (
                      <Fragment key={i}>
                        {line.map((part, j) =>
                          typeof part === "string" ? part : <mark key={j} className="sample-field">{showAliased ? part[1] : part[0]}</mark>,
                        )}
                        {"\n"}
                      </Fragment>
                    ))}
                  </pre>
                </figure>
              </TabsContent>
            ))}
            <div className="sample-switch-row">
              <span>Original</span>
              <label className="sample-switch">
                <input type="checkbox" checked={showAliased} onChange={(event) => setShowAliased(event.target.checked)} />
                <span className="sample-slider" aria-hidden="true" />
                <span className="visually-hidden">Show aliased version</span>
              </label>
              <span>Aliased</span>
            </div>
          </Tabs>
          <p className="landing-cta-note">Detection is automated. Notice what it replaced, and what it left for you to review.</p>
        </section>

        <section className="landing-section landing-promises" aria-labelledby="boundary-title">
          <h2 id="boundary-title">What we can promise, and what we can’t</h2>
          <p className="landing-intro">Plain commitments, and the limits that come with them.</p>
          <div className="promise-grid">
            <div className="promise-col promise-yes">
              <p className="promise-col-head">We promise</p>
              <ul className="promise-list">
                <li><CheckCircle2 size={16} aria-hidden="true" /><span><strong>Your document is processed in Canada.</strong></span></li>
                <li><CheckCircle2 size={16} aria-hidden="true" /><span><strong>Your original is deleted when processing finishes,</strong> even if something goes wrong.</span></li>
                <li><CheckCircle2 size={16} aria-hidden="true" /><span><strong>We do not use your documents to train LawyerLab models.</strong> This is our policy, not a blanket vendor guarantee.</span></li>
                <li><CheckCircle2 size={16} aria-hidden="true" /><span><strong>We don’t routinely review uploaded documents.</strong> Processing is automated.</span></li>
              </ul>
            </div>
            <div className="promise-col promise-no">
              <p className="promise-col-head">We can’t promise</p>
              <ul className="promise-list">
                <li><MinusCircle size={16} aria-hidden="true" /><span><strong>That we find every personal detail.</strong> Detection can miss things.</span></li>
                <li><MinusCircle size={16} aria-hidden="true" /><span><strong>That removing names protects privilege.</strong> Amounts, events and unusual facts can still point to a client.</span></li>
                <li><MinusCircle size={16} aria-hidden="true" /><span><strong>Legal advice.</strong> LawyerLab is a tool, not a lawyer.</span></li>
                <li><MinusCircle size={16} aria-hidden="true" /><span><strong>A replacement for your judgment.</strong> You decide whether the result is safe to use.</span></li>
              </ul>
            </div>
          </div>
          <div className="promise-band">
            <p>LawyerLab supports your judgment. It doesn’t replace it. You review every result and make the call.</p>
            <Link to="/commitments/" className="promise-link">Read our full commitments →</Link>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="work-title">
          <p className="eyebrow">What’s next</p>
          <h2 id="work-title">What we’re working on</h2>
          <p className="landing-intro">LawyerLab explores bounded AI workflows for legal practice. Document Alias is available now. These are the workflows we’re considering next.</p>
          <div className="table-scroll">
            <table className="report-table">
              <thead>
                <tr><th scope="col">Workflow</th><th scope="col">Status</th><th scope="col">Purpose</th></tr>
              </thead>
              <tbody>
                <tr><td>Document Alias</td><td>Available now</td><td>Replaces detected personal details with consistent placeholders.</td></tr>
                <tr><td>Agreement to intake</td><td>In exploration</td><td>Pulls parties and key details from an agreement to start intake.</td></tr>
                <tr><td>Case assessment</td><td>In exploration</td><td>Breaks down a decision’s issues, tests, sources, and outcome.</td></tr>
              </tbody>
            </table>
          </div>
          <p className="landing-cta-note">Not legal advice. You stay responsible for how your firm uses AI.</p>
        </section>

        <section className="landing-section landing-faq-section" aria-labelledby="faq-title">
          <h2 id="faq-title">Frequently asked questions</h2>
          <div className="landing-faq">
            {FAQ_GROUPS.map((group) => (
              <Fragment key={group.title ?? "main"}>
                {group.title && <h3>{group.title}</h3>}
                {group.items.map(([q, a]) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
              </Fragment>
            ))}
          </div>
        </section>

        <section className="landing-section landing-conversion" aria-labelledby="start-title">
          <p className="eyebrow">Start here</p>
          <h2 id="start-title">Looking to work more effectively with AI in your legal practice?</h2>
          <p className="landing-intro">Start with one bounded workflow. Try Document Alias now, or join the waitlist for new tools, practical examples, and risk notes.</p>
          <div className="landing-cta">
            <Button asChild size="default"><Link to="/playground/">Open the playground</Link></Button>
            <Button asChild variant="secondary" size="default"><a href="#waitlist">Join the waitlist</a></Button>
            <p className="landing-cta-note"><Link to="/work-with-us/">Need help deciding what fits your practice? Work with Lawtrepreneur →</Link></p>
          </div>
        </section>

        <section className="landing-waitlist" aria-labelledby="waitlist">
          <div className="landing-waitlist-inner">
            <div>
              <h2 id="waitlist">Help shape what we are building</h2>
              <p className="landing-intro">Join the beta to try new tools first and tell us what works and what doesn’t.</p>
            </div>
            <WaitlistForm source={params.get("source") ?? "lawyerlab"} />
          </div>
        </section>

      </main>

      <SiteFooter />
    </div>
  )
}
