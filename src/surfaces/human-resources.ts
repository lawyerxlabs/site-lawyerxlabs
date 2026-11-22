import type { SurfaceConfig } from "./contract"

// No approved HR brand asset yet: reuses the LawyerLab icon and theme (no theme override).
export const humanResources: SurfaceConfig = {
  id: "human-resources",
  name: "Human Resources Lab",
  home: "/playground/?workflow=docalias",
  icon: "/lawyerlab-logo-mark.svg",
  waitlistUrl: "https://lawyerlab.ca/?source=human-resources#waitlist",
  workflows: ["docalias", "hr-hiring", "hiring-package", "hr-onboarding"],
  copy: {
    workflowEyebrow: "Hiring workflow",
    disclaimer: "This extracts source-labelled details. It does not infer missing information or make legal or compliance assessments. Review every output with a human before use.",
    trustTitle: "Trust Centre",
    sidebarNote: "Review every output with a human before use. This tool does not make legal or compliance assessments.",
    trustPoints: [
      ["Source-labelled output", "Details are extracted with their source labels so you can check each one against the original document."],
      ["Human review required", "Every output must be reviewed by a person before you use it."],
      ["No legal or compliance assessment", "This tool does not infer missing information or make legal or compliance assessments."],
    ],
  },
}
