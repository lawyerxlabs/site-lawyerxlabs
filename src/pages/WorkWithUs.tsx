import { InfoPage, PageSection } from "@/components/InfoPage"

export function WorkWithUs() {
  return (
    <InfoPage
      eyebrow="Work with us"
      title="Integrate LawyerLab into your workflows."
      intro="Use AI on client documents with clearer privacy boundaries. We can talk through how LawyerLab may fit into the way your firm already works."
      links={[
        { id: "count-on", label: "Commitments" },
        { id: "fit", label: "Fit" },
        { id: "handles", label: "What it handles" },
        { id: "not", label: "Boundaries" },
        { id: "contact", label: "Contact" },
      ]}
    >
      <PageSection id="count-on" title="What you can count on">
        <p className="landing-intro">We only make claims we can stand behind. The specific commitments we have agreed to are listed on our commitments page.</p>
        <p className="landing-intro"><a href="/commitments/">Read our commitments</a></p>
      </PageSection>

      <PageSection id="fit" title="How it may fit">
        <p className="landing-intro">Every firm works differently. A short conversation helps us see whether LawyerLab suits one of your workflows. If it does, we can talk about a small pilot to test it on real work.</p>
        <p className="landing-intro">A conversation or pilot is not a promise of setup, implementation, or custom integration. We will tell you plainly what we can and cannot do.</p>
      </PageSection>

      <PageSection id="handles" title="What it handles">
        <p className="landing-intro">LawyerLab prepares documents for AI use. It finds personal information and replaces it with consistent placeholders, and it shows you what it changed.</p>
        <p className="landing-intro">For transaction intake, it can locate party details, property, price, deposit, and key dates in an agreement by their labels. A field it cannot find is marked as missing, not guessed.</p>
        <p className="landing-intro">We are exploring other workflows, but we are not promising them yet.</p>
      </PageSection>

      <PageSection id="not" title="What this isn’t">
        <p className="landing-intro">LawyerLab does not give legal advice. It does not replace your professional judgment, and you should review every output before you use it.</p>
        <p className="landing-intro">Removing names and other details does not, on its own, protect privilege. The facts that remain can still reveal who the client is and what the matter is about.</p>
      </PageSection>

      <PageSection id="contact" title="Contact">
        <p className="landing-intro">Send us an email and tell us a little about your practice.</p>
        <div className="landing-cta">
          <a className="work-contact" href="mailto:hello@lawyerlab.ca">Email hello@lawyerlab.ca</a>
        </div>
      </PageSection>

      <section className="landing-section" aria-label="Next step">
        <p className="landing-intro">No pressure. Tell us what’s getting in the way, and we’ll tell you honestly whether we can help.</p>
      </section>
    </InfoPage>
  )
}
