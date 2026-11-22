import { CATALOG } from "@/lib/workflows"

export const TEST_WORKFLOW_CAPABILITIES = CATALOG.filter((workflow) => workflow.backendId !== null).map((workflow) => ({
  id: workflow.backendId!,
  identity_requirement: workflow.id === "docalias" ? "public" as const : "protected" as const,
  intake_modes: workflow.inputModes.filter((mode) => mode === "file" || mode === "text" || mode === "sample"),
  accepted_file_types: workflow.acceptedFileTypes ?? [".pdf", ".docx"],
  pii_profile: workflow.id === "docalias" ? "public-redaction" : "protected-document",
  handling: workflow.handling ?? { capability: "selectable" as const, choices: ["reject", "redact"] as const, default: "redact" as const },
  results: { markdown: true, report: true, artifact: true },
}))
