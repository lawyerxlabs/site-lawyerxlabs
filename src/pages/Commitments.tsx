import { InfoPage, PageSection } from "@/components/InfoPage"

export function Commitments() {
  return (
    <InfoPage
      eyebrow="Our commitments"
      title="Our commitments, and where they end"
      intro="How we protect your files, and where your judgment takes over."
      links={[
        { id: "commitments", label: "Commitments" },
        { id: "limits", label: "Limits" },
        { id: "questions", label: "Questions" },
      ]}
    >
      <PageSection id="commitments" title="What happens to your files">
        <p className="landing-intro">LawyerLab replaces detected personal information with consistent placeholders. Detection is automated, so it may miss details; review the result before relying on it.</p>
        <ol>
          <li><strong>Upload.</strong> You choose a source file to process.</li>
          <li><strong>Processing.</strong> Documents are processed in Canada. When OCR is needed, it runs on a self-hosted OCR model on infrastructure we operate. Uploaded source files are deleted after processing completes or fails.</li>
          <li><strong>Review.</strong> Generated results are held temporarily so you can retrieve them. For PDFs, source-page previews are rendered locally in your browser.</li>
        </ol>
        <p className="landing-intro">Processing is automated, and our team does not routinely open or review files. The app gateway and OCR proxy log request metadata, not document bodies. Uploaded document content is not used to train LawyerLab models.</p>
        <p className="landing-intro">These are not claims that all output stays in your browser or that generated results are deleted immediately.</p>
      </PageSection>

      <PageSection id="limits" title="What this cannot do">
        <p className="landing-intro">Automated detection may miss personal information. Replacing personal details does not remove case facts, and does not independently protect solicitor-client privilege. Check the document and use your own judgment before sharing or relying on it.</p>
        <p className="landing-intro">Before using AI with a document, ask yourself:</p>
        <ul>
          <li>Am I allowed to use this document with this service?</li>
          <li>Have I removed or replaced details that could identify someone?</li>
          <li>Could the remaining facts still identify a person or reveal confidential information?</li>
          <li>Have I checked the output against the source before using or sharing it?</li>
        </ul>
      </PageSection>

      <PageSection id="questions" title="Questions">
        <p className="landing-intro">This page gives general information, not legal advice. It does not decide whether a particular document is safe or appropriate for you to use with AI. If you are unsure, pause and get advice from a qualified professional.</p>
      </PageSection>
    </InfoPage>
  )
}
