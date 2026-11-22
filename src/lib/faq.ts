export type FaqItem = [question: string, answer: string]
export type FaqGroup = { title?: string; items: FaqItem[] }

// Shared by the landing FAQ and the /faq/ page so the two surfaces cannot drift.
export const FAQ_GROUPS: FaqGroup[] = [
  {
    items: [
      ["Where does my file go?", "Documents are processed in Canada. Uploaded source files are deleted after processing completes or fails. Results are temporary and held on the server until they are read, purged, or expire. We do not use uploaded document content to train LawyerLab models."],
      ["What do I tell clients and my insurer?", "Point them to our commitments page. It explains what we promise and what we can’t promise. It is not a guarantee or legal advice; check your own professional obligations."],
    ],
  },
  {
    title: "Limits",
    items: [
      ["What counts as personal information?", "Names, email addresses and phone numbers. Other detected types may vary by document and configuration."],
      ["Will it catch everything?", "No. Automated detection can miss things. That’s why every result comes with a report. Compare the working copy with your original every time."],
    ],
  },
  {
    title: "Practical",
    items: [
      ["Which files can I upload?", "One PDF or DOCX file at a time."],
      ["Can I use a scanned PDF?", "Yes. Scanned pages are read with OCR when needed. Results depend on scan quality, so review every page against the original."],
      ["Is it free?", "Free to try, with no account required. Paid options may come later; we’ll share details when they’re ready."],
      ["Is this legal advice?", "No. LawyerLab is a tool. It supports your judgment and doesn’t replace it."],
    ],
  },
]
