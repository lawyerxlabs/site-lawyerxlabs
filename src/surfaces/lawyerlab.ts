import type { SurfaceConfig } from "./contract"

export const lawyerlab: SurfaceConfig = {
  id: "lawyerlab",
  name: "LawyerLab",
  home: "/mvp/",
  icon: "/lawyerlab-logo-mark.svg",
  waitlistUrl: "/#waitlist",
  workflows: ["docalias", "contract-review", "transaction-review", "case-analysis", "agreement-review", "hr-hiring", "hiring-package", "hr-onboarding", "term-isolation"],
  copy: {
    workflowEyebrow: "YOUR AI WORKFLOW",
    disclaimer: "Review every output before use in your practice.",
    trustTitle: "Trust Centre",
    sidebarNote: "Review all outputs before using it in your practice.",
    contactUrl: "mailto:hello@lawyerlab.ca",
    trustPoints: [
      ["Review every output", "Check each result against its source before use in your practice."],
      ["Understand the workflow", "The Guide describes how each workflow prepares its output and its limits."],
      ["Detection has limits", "Automated detection can miss personal information. Review the output before sharing it."],
    ],
  },
}
