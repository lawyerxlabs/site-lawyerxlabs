// ponytail: keep API contract and transport in one small module.
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "rejected" | "purged"
// Gateway currently emits only completed/failed; queued/running are defensive for in-flight workflow runs.
export type WorkflowStatus = "queued" | "running" | "completed" | "failed"

export type JobError = { code: string; message: string }

export type Job = {
  job_id: string
  status: JobStatus
  created_at: string
  started_at: string | null
  completed_at: string | null
  expires_at: string | null
  max_bytes: number
  max_pages: number
  error?: JobError
  links?: { self: string; report: string }
  workflow?: { id: string; version: string; status: WorkflowStatus; error_code?: string | null; sensitive?: boolean | null }
}

export type ContractReviewArtifact = {
  artifact: {
    type: "contract-review-v1"
    schema_version: "1"
    summary: string
    claims: { documentId: string; anchorId: string; quote: string }[]
  }
}

// Whitelist-only artifact check: exact keys, no extra source/mappings/restoration data. Never throws.
export function acceptsContractReviewArtifact(result: unknown): boolean {
  if (!isObject(result)) return false
  const { artifact, ...rest } = result as Record<string, unknown>
  if (Object.keys(rest).length !== 0) return false
  if (!isObject(artifact)) return false
  const { type, schema_version, summary, claims, ...artifactRest } = artifact as Record<string, unknown>
  if (Object.keys(artifactRest).length !== 0) return false
  if (type !== "contract-review-v1" || schema_version !== "1" || typeof summary !== "string") return false
  if (!Array.isArray(claims) || claims.length !== 1) return false
  return claims.every((claim) => {
    if (!isObject(claim)) return false
    const { documentId, anchorId, quote, ...claimRest } = claim as Record<string, unknown>
    if (Object.keys(claimRest).length !== 0) return false
    return typeof documentId === "string" && documentId.trim() !== "" && typeof anchorId === "string" && anchorId.trim() !== "" && typeof quote === "string" && quote.trim() !== ""
  })
}

export type Report = {
  schema_version: string
  entity_counts: Record<string, number>
  low_confidence_spans: unknown[]
  unprocessed_pages: number[]
  dropped_images: number
  ocrUsed?: boolean
  ocr?: { model?: string }
  pages?: ReportPage[]
  blocks?: Block[]
}

export type ReportPage = {
  page: number
  source?: string
  ocr_model?: string
}

export type Block = {
  id: string
  page: number
  type: "heading" | "paragraph" | "list_item" | "table" | "unknown"
  text: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  engine: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds: number | null = null,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

const API_BASE = "/v1"

export type WorkflowCapability = {
  id: string
  identity_requirement: "public" | "protected"
  intake_modes: readonly ("file" | "text" | "sample")[]
  accepted_file_types: readonly string[]
  pii_profile: string
  handling: {
    capability: "none" | "fixed" | "selectable"
    choices: readonly ("reject" | "redact" | "off" | "pseudonymise")[]
    default: "reject" | "redact" | "off" | "pseudonymise" | null
  }
  results: { markdown: boolean; report: boolean; artifact: boolean }
}

const IDENTITY_REQUIREMENTS = ["public", "protected"] as const
const INTAKE_MODES = ["file", "text", "sample"] as const
const HANDLING_CAPABILITIES = ["none", "fixed", "selectable"] as const
const HANDLING_CHOICES = ["reject", "redact", "off", "pseudonymise"] as const

function parseWorkflowCapabilities(body: unknown): WorkflowCapability[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { workflows?: unknown }).workflows)) throw new ApiError(502, "invalid_workflow_catalog", "workflow catalog is invalid")
  const workflows = (body as { workflows: unknown[] }).workflows
  if (workflows.some((w) => {
    if (!w || typeof w !== "object") return true
    const x = w as Record<string, unknown>
    if (typeof x.id !== "string" || !IDENTITY_REQUIREMENTS.includes(x.identity_requirement as "public" | "protected")
      || !Array.isArray(x.intake_modes) || x.intake_modes.some((m) => !INTAKE_MODES.includes(m as "file" | "text" | "sample"))
      || !Array.isArray(x.accepted_file_types) || !x.accepted_file_types.every((t) => typeof t === "string")
      || typeof x.pii_profile !== "string") return true
    const handling = x.handling as Record<string, unknown> | undefined
    if (!handling || typeof handling !== "object" || !HANDLING_CAPABILITIES.includes(handling.capability as "none" | "fixed" | "selectable")
      || !Array.isArray(handling.choices) || !handling.choices.every((c) => HANDLING_CHOICES.includes(c as "reject" | "redact" | "off" | "pseudonymise"))
      || handling.default !== null && !HANDLING_CHOICES.includes(handling.default as "reject" | "redact" | "off" | "pseudonymise")) return true
    const choices = handling.choices as string[]
    if ((handling.capability === "none" && (choices.length !== 0 || handling.default !== null))
      || (handling.capability === "fixed" && (choices.length !== 1 || handling.default !== choices[0]))
      || (handling.capability === "selectable" && (choices.length === 0 || handling.default === null || !choices.includes(handling.default as string)))) return true
    const results = x.results as Record<string, unknown> | undefined
    if (!results || typeof results !== "object" || !isBoolean(results.markdown) || !isBoolean(results.report) || !isBoolean(results.artifact)) return true
  })) throw new ApiError(502, "invalid_workflow_catalog", "workflow catalog is invalid")
  return workflows as WorkflowCapability[]
}

export async function fetchWorkflowCapabilities(): Promise<WorkflowCapability[]> {
  return parseWorkflowCapabilities(await checked(await fetch(`${API_BASE}/workflows`)).then((response) => response.json()))
}

export type AgreementReviewResult = { artifact: { claims: { documentId: string; anchorId: string; quote: string; finding: string }[] }; notice: string }

export async function submitAgreementReview(file: File, token: string, signal?: AbortSignal): Promise<AgreementReviewResult> {
  const form = new FormData()
  form.append("file", file)
  form.append("cf_turnstile_response", token)
  const response = await checked(await fetch(`${API_BASE}/agreement-review`, { method: "POST", body: form, signal }))
  let body: unknown
  try { body = await response.json() } catch { throw new ApiError(502, "incompatible_artifact", "This workflow needs an update before the result can be shown.") }
  const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => isObject(value) && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  if (!exact(body, ["artifact", "notice"]) || typeof body.notice !== "string" || !exact(body.artifact, ["claims"]) || !Array.isArray(body.artifact.claims) || body.artifact.claims.length < 1 || body.artifact.claims.length > 20 || !body.artifact.claims.every((claim) => exact(claim, ["documentId", "anchorId", "quote", "finding"]) && claim.documentId === "agreement" && typeof claim.anchorId === "string" && /^page-[1-9]\d*$/.test(claim.anchorId) && typeof claim.quote === "string" && claim.quote.trim().length > 0 && Array.from(claim.quote).length <= 500 && typeof claim.finding === "string" && claim.finding.trim().length > 0 && Array.from(claim.finding).length <= 1000)) throw new ApiError(502, "incompatible_artifact", "This workflow needs an update before the result can be shown.")
  return body as AgreementReviewResult
}

function retryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  return Number(value)
}

async function checked(response: Response): Promise<Response> {
  if (response.ok) return response
  let code = "error"
  let message = `HTTP ${response.status}`
  try {
    const body = await response.json()
    code = body.error?.code ?? code
    message = body.error?.message ?? message
  } catch {}
  throw new ApiError(response.status, code, message, retryAfter(response.headers.get("Retry-After")))
}

export async function upload(file: File, turnstileToken: string, workflow?: string, handling?: string): Promise<Job> {
  const form = new FormData()
  form.append("file", file)
  form.append("cf_turnstile_response", turnstileToken)
  if (workflow) form.append("workflow", workflow)
  if (handling) form.append("workflow_settings", JSON.stringify({ handling }))
  return (await checked(await fetch(`${API_BASE}/jobs`, { method: "POST", body: form }))).json()
}

export async function fetchArtifact(jobId: string): Promise<unknown> {
  return (await checked(await fetch(`${API_BASE}/jobs/${jobId}/result/artifact`))).json()
}

export async function getJob(id: string): Promise<Job> {
  return (await checked(await fetch(`${API_BASE}/jobs/${id}`))).json()
}

export async function getMarkdown(id: string): Promise<string> {
  return (await checked(await fetch(`${API_BASE}/jobs/${id}/result/markdown`))).text()
}

export async function getReport(id: string): Promise<Report> {
  return (await checked(await fetch(`${API_BASE}/jobs/${id}/result/report`))).json()
}

export async function deleteJob(id: string): Promise<void> {
  const raw = await fetch(`${API_BASE}/jobs/${id}`, { method: "DELETE" })
  // 404 = already purged (anonymous jobs are purged once both results are read); the goal is met.
  if (raw.status === 404) return
  const response = await checked(raw)
  if (response.status !== 204) throw new ApiError(response.status, "unexpected_status", `HTTP ${response.status}`)
}

// Synchronous HR review (v2). Not a job: no polling, no read-once result endpoints.
export type HrSingleField = "role_title" | "role_summary" | "work_location" | "employment_type" | "compensation" | "hiring_timeline"
export type HrListField = "responsibilities" | "qualifications" | "required_experience" | "preferred_experience" | "skills" | "education" | "working_conditions"
export type HrItem = { value: string; status: "source_anchored"; source: { page: number; anchor: string } }
export type HrIntakeFact = { field: "role_title" | "work_location" | "employment_type" | "hiring_timeline"; value: string; status: "user_provided" }
export type HrEmploymentType = "full-time" | "part-time" | "fixed-term" | "other"

export type HrSource = { kind: "pasted_text"; text: string } | { kind: "pdf"; file: File }
export type HrDecision = "confirm" | "correct" | "exclude" | "unresolved"
export type HrCriterion = {
  criterion_id: string
  label: string
  extracted_value?: string | string[] | null
  extraction_status?: string
  decision: HrDecision
  provenance?: { kind: string; source_sha256?: string; page?: number; anchor?: string; locator?: { page?: number; anchor?: string } }
}
export type HrSession = {
  session_id: string
  status: "source_ready"
  source: { kind: "pasted_text" | "pdf"; sha256: string; character_count?: number; page_count?: number }
  workflow_settings: { handling: "reject" | "redact" | "off" | "pseudonymise" }
  preview: { status: string; text: string }
  criteria: HrCriterion[]
  gaps: unknown[]
  limitations: string[]
  outcomes: string[]
  limits: Record<string, number>
}
export type HrGeneration = {
  session_id: string
  status: "generated"
  source_sha256: string
  outcome: "improved_job_description"
  format: "text/markdown"
  content: string
  criteria: Array<{ criterion_id: string; decision: HrDecision; value?: string; provenance: { kind: string; source_sha256?: string; locator?: unknown } }>
  disclaimer: string
}

// Members only (protected session). Pasted text is JSON; a PDF is multipart.
export async function createHrSession(source: HrSource, handling?: string): Promise<HrSession> {
  let body: BodyInit
  const headers: HeadersInit = {}
  const settings = handling ? { workflow_settings: { handling } } : {}
  if (source.kind === "pasted_text") {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify({ source: { kind: "pasted_text", text: source.text }, ...settings })
  } else {
    const form = new FormData()
    form.append("file", source.file)
    if (handling) form.append("workflow_settings", JSON.stringify({ handling }))
    body = form
  }
  const r = await checked(await fetch("/hr/v1/sessions", { method: "POST", headers, body }))
  if (r.status !== 201) throw new ApiError(r.status, "unexpected_status", `HTTP ${r.status}`)
  return r.json()
}

export async function generateHrSession(sessionId: string, criteria: Array<{ criterion_id: string; decision: HrDecision; value?: string }>, idempotencyKey: string): Promise<HrGeneration> {
  const r = await checked(await fetch(`/hr/v1/sessions/${encodeURIComponent(sessionId)}/generation`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({ outcome: "improved_job_description", criteria }) }))
  if (r.status !== 200) throw new ApiError(r.status, "unexpected_status", `HTTP ${r.status}`)
  return r.json()
}

export async function deleteHrSession(sessionId: string): Promise<void> {
  const response = await checked(await fetch(`/hr/v1/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }))
  if (response.status !== 204) throw new ApiError(response.status, "unexpected_status", `HTTP ${response.status}`)
}

export type HiringPackageSession = { id: string; expiresAt: string }
export type HiringPackageDraft = { id: string; text: string; changed: boolean }
export type HiringPackageApproval = { id: string; versionId: string; text: string; changed: boolean }

// Member-only hiring package sessions (/v1). Pasted text is JSON; a PDF is multipart.
export async function createHiringPackageSession(source: HrSource): Promise<HiringPackageSession> {
  let body: BodyInit
  const headers: HeadersInit = {}
  if (source.kind === "pasted_text") {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify({ source: { kind: "pasted_text", text: source.text } })
  } else {
    const form = new FormData()
    form.append("file", source.file)
    body = form
  }
  const r = await checked(await fetch(`${API_BASE}/hiring/sessions`, { method: "POST", headers, body }))
  if (r.status !== 201) throw new ApiError(r.status, "unexpected_status", `HTTP ${r.status}`)
  const json = await r.json()
  return { id: json.id, expiresAt: json.expires_at }
}

export async function generateHiringPackage(id: string): Promise<HiringPackageDraft> {
  const r = await checked(await fetch(`${API_BASE}/hiring/sessions/${encodeURIComponent(id)}/generate`, { method: "POST" }))
  if (r.status !== 200) throw new ApiError(r.status, "unexpected_status", `HTTP ${r.status}`)
  return r.json()
}

export async function approveHiringPackage(id: string, text: string, expectedVersionId?: string): Promise<HiringPackageApproval> {
  const body = JSON.stringify({ text, ...(expectedVersionId ? { expected_version_id: expectedVersionId } : {}) })
  const r = await checked(await fetch(`${API_BASE}/hiring/sessions/${encodeURIComponent(id)}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body }))
  if (r.status !== 200) throw new ApiError(r.status, "unexpected_status", `HTTP ${r.status}`)
  const json = await r.json()
  return { id: json.id, versionId: json.version_id, text: json.text, changed: json.changed }
}

export async function deleteHiringPackage(id: string): Promise<void> {
  const response = await checked(await fetch(`${API_BASE}/hiring/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }))
  if (response.status !== 204) throw new ApiError(response.status, "unexpected_status", `HTTP ${response.status}`)
}

export type TxTemplate = { id: string; name: string; version: string }
export type TxFieldStatus = "found" | "ambiguous" | "not_found"
export type TxField = {
  value: string | null
  page: number | null
  status: TxFieldStatus
  locators: { page: number; anchor: string }[]
}
export type TxSession = {
  session_id: string
  status: string
  source: { kind: "pasted_text" | "pdf" }
  matched_template: TxTemplate
  fields: Record<string, TxField>
}
export type TxErrorCode =
  | "invalid_request"
  | "template_unmatched"
  | "invalid_source"
  | "queue_full"
  | "too_large"
  | "extraction_failed"
  | "feature_disabled"
  | "session_limit_reached"
  | "not_found"
  | "unauthorized"
export type TxSource = { kind: "pasted_text"; text: string } | { kind: "pdf"; file: File }

export async function createTxSession(source: TxSource, template?: string, handling?: string): Promise<TxSession> {
  let body: BodyInit
  const headers: HeadersInit = {}
  if (source.kind === "pasted_text") {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify({ source: { kind: "pasted_text", text: source.text }, ...(template ? { template } : {}), ...(handling ? { workflow_settings: { handling } } : {}) })
  } else {
    const form = new FormData()
    form.append("file", source.file)
    if (template) form.append("template", template)
    if (handling) form.append("workflow_settings", JSON.stringify({ handling }))
    body = form
  }
  return (await checked(await fetch("/tx/v1/sessions", { method: "POST", headers, body }))).json()
}

export async function getTxSession(sessionId: string): Promise<TxSession> {
  return (await checked(await fetch(`/tx/v1/sessions/${encodeURIComponent(sessionId)}`))).json()
}

export async function deleteTxSession(sessionId: string): Promise<void> {
  const response = await checked(await fetch(`/tx/v1/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }))
  if (response.status !== 204) throw new ApiError(response.status, "unexpected_response", "expected 204 response")
}

const hrMessages: Record<string, string> = {
  pii_rejected: "This looks like a personal file (for example a resume or ID). Use a job description instead.",
  processing_unavailable: "Source screening is unavailable right now — try again shortly",
  session_limit_reached: "Too many active sessions — delete one or try again later",
  generation_limit_reached: "Generation limit reached for this source — prepare it again to continue",
  generation_budget_exhausted: "Generation is paused for today across the service — try again tomorrow",
  llm_not_configured: "Job description generation is not available yet",
  generation_failed: "Generation failed — try again",
  generation_outcome_unknown: "Generation outcome is uncertain. Do not retry with a new request; contact support before continuing.",
  generation_already_completed: "Generation completed, but its result is unavailable. Do not submit again with a new key; contact support.",
  generation_validation_unavailable: "The provider returned a draft, but final validation is unavailable. This generation cannot be retried; contact support to reconcile the outcome before continuing.",
  generation_output_invalid: "The provider returned a draft that failed validation. This generation cannot be retried; contact support to reconcile the outcome before continuing.",
  generation_output_rejected: "The provider returned a draft that failed personal-data validation. This generation cannot be retried; contact support to reconcile the outcome before continuing.",
  generation_fact_violation: "The provider returned a draft that failed factual validation. This generation cannot be retried; contact support to reconcile the outcome before continuing.",
  session_not_found: "This session expired — prepare your source again",
  rate_limit_exceeded: "Too many requests from your network — try again in a few minutes",
}
export function hrFriendlyError(e: unknown): string {
  return (e instanceof ApiError && hrMessages[e.code]) || friendlyError(e)
}

// Browser-safe read-only reflection of the deployed /v1/me. Never computed client-side; POST enforces.
export type Me = {
  authenticated: boolean
  tier: "anonymous" | "member"
  quota: { limit: number; used: number; remaining: number; resets_at: string }
  retention: { results_ttl_seconds: number; source_file_removed_after_processing: boolean; results_purged_after_all_parts_fetched: boolean }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean"

// Validates the exact /v1/me shape before any cast; a drifted body is treated as unknown.
function parseMe(body: unknown): Me | null {
  if (!isObject(body) || typeof body.authenticated !== "boolean") return null
  if (body.tier !== "anonymous" && body.tier !== "member") return null
  const { quota, retention } = body
  if (!isObject(quota) || !isFiniteNumber(quota.limit) || !isFiniteNumber(quota.used) || !isFiniteNumber(quota.remaining) || typeof quota.resets_at !== "string") return null
  if (!isObject(retention) || typeof retention.source_file_removed_after_processing !== "boolean" || !isFiniteNumber(retention.results_ttl_seconds)) return null
  if (typeof retention.results_purged_after_all_parts_fetched !== "boolean") return null
  return body as Me
}

// Any 4xx/5xx or bad body → null (unknown quota); must not block upload.
export async function getMe(): Promise<Me | null> {
  try {
    const response = await fetch(`${API_BASE}/me`)
    if (!response.ok) return null
    return parseMe(await response.json())
  } catch {
    return null
  }
}

// Sidecar session (cookie-based). Any failure means signed out (null).
// sub is the opaque, stable account ID; null when absent or malformed (signed in, but not usable for owner-bound state).
export type Identity = { sub: string | null; name: string | null; email: string | null }
export async function getSession(): Promise<Identity | null> {
  try {
    const response = await fetch("/api/auth/session")
    if (!response.ok) return null
    const body = (await response.json()) as { authenticated?: boolean; sub?: unknown; name?: unknown; email?: unknown }
    if (body.authenticated !== true) return null
    const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null)
    return { sub: typeof body.sub === "string" && body.sub.trim() ? body.sub : null, name: text(body.name), email: text(body.email) }
  } catch {
    return null
  }
}

// Account label: name → email → generic fallback.
export function identityLabel(identity: Identity | null): string {
  return identity?.name ?? identity?.email ?? "Signed in"
}

// Rounds up so the user never retries before the window opens.
function waitText(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`
  if (seconds < 60) return plural(seconds, "second")
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return plural(minutes, "minute")
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${plural(hours, "hour")} ${plural(rest, "minute")}` : plural(hours, "hour")
}

export function friendlyError(e: unknown): string {
  if (!(e instanceof ApiError)) return "Something went wrong — try again"
  const messages: Record<string, string> = {
    malformed_request: "The upload could not be read — try again",
    missing_file: "Choose a PDF or DOCX file",
    invalid_page_range: "The selected page range is invalid",
    invalid_processing_mode: "The processing option is invalid — reload and try again",
    turnstile_required: "Complete human verification, then try again",
    unsupported_type: "File type is not supported",
    too_large: "File is too large",
    too_many_pages: "File has too many pages",
    too_few_text_pages: "File has too little selectable text",
    timeout: "Processing timed out — try again",
    redaction_failed: "Redaction failed — try again",
    low_confidence: "Redaction confidence was too low",
    purged: "Job output has expired",
    extraction_failed: "Text extraction failed — try again or use a different file",
    internal: "Internal error — try again",
    restart: "Processing was interrupted — try again",
    cancelled: "Job was cancelled",
    invalid_docx: "The DOCX file is invalid — check it and try again",
    mismatched_content: "File content does not match its type — use a real PDF or DOCX",
    page_count_unknown: "Page count could not be determined — try another file",
    body_too_large: "File is too large",
    not_found: "Job not found — it may have been deleted or expired",
    not_completed: "Result is not ready yet",
  }
  if (e.code === "turnstile_failed") return "Human verification was not accepted — refresh it and try again"
  if (e.status === 400) return messages[e.code] ?? (e.code === "invalid_request" ? "The request was invalid — check the file and try again" : "The request could not be processed — try again")
  if (e.status === 413) return "File is too large"
  if (e.status === 415) return "Use a PDF or DOCX file"
  if (e.code === "rate_limit_exceeded") return "Daily anonymous upload limit reached — sign in or try again tomorrow"
  if (e.status === 429) {
    const cause = { queue_full: "Queue is full", org_limit: "Too many jobs are currently processing" }[e.code] ?? "Too many requests"
    return e.retryAfterSeconds === null ? `${cause} — try again later` : `${cause} — try again in ${waitText(e.retryAfterSeconds)}`
  }
  if (e.status === 401 || e.status === 403) return "Upload request could not be authorized — refresh and try again"
  return messages[e.code] ?? "Something went wrong — try again"
}

// ── Onboarding (/onboard/v1) ────────────────────────────────────────────────

export type OnboardSourceMeta = {
  source_id: string
  filename: string
  media_type: string
}

export type OnboardClassification = {
  source_id: string
  document_type: string
  confidence: string
  alternatives: string[]
}

export type OnboardSession = {
  session_id: string
  expires_at: string
  status: "awaiting_classification_confirmation"
  workflow_settings: { handling: "redact" | "reject" | "off" | "pseudonymise" }
  sources: OnboardSourceMeta[]
  classification_review: {
    classifications: OnboardClassification[]
    job_description_source_ids: string[]
  }
}

export type OnboardConfirmed = {
  session_id: string
  status: "ready_for_generation"
  confirmed_classifications: Array<{ source_id: string; document_type: string }>
  expires_at: string
}

export async function createOnboardSession(files: File[], handling: "redact"): Promise<OnboardSession> {
  const form = new FormData()
  for (const file of files) form.append("files", file)
  form.append("workflow_settings", JSON.stringify({ handling }))
  return (await checked(await fetch("/onboard/v1/sessions", { method: "POST", body: form }))).json()
}

export async function confirmOnboardClassifications(
  sessionId: string,
  classifications: Array<{ source_id: string; document_type: string }>,
): Promise<OnboardConfirmed> {
  return (
    await checked(
      await fetch(`/onboard/v1/sessions/${encodeURIComponent(sessionId)}/classifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classifications }),
      }),
    )
  ).json()
}

export type OnboardProvenance = {
  source_id: string
  location: { char_start: number; char_end: number }
  quote: string
}

export type OnboardItem = {
  id: string
  position: number
  task: string
  timing: string | null
  owner: string
  dependencies: string[]
  confirmation_required: boolean
  confirmation_label?: string
  provenance: OnboardProvenance[]
}

export type OnboardMissingInfo = { item_id: string; detail: string; confirmation_label: string }

export type OnboardArtifact = {
  schema_version: "onboard.v1"
  title: string
  items: OnboardItem[]
  missing_information: OnboardMissingInfo[]
  limitations: string[]
  notice: string
}

export type OnboardGenerated = { session_id: string; status: "generated"; artifact: OnboardArtifact }

// Read-once: never retried by the client. Callers must not repeat this on failure without an explicit user action.
export async function generateOnboardSequence(sessionId: string): Promise<OnboardGenerated> {
  return (
    await checked(
      await fetch(`/onboard/v1/sessions/${encodeURIComponent(sessionId)}/generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    )
  ).json()
}

export async function deleteOnboardSession(sessionId: string): Promise<void> {
  await checked(await fetch(`/onboard/v1/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }))
}

// Term isolation (raw, ADR-009): upload is raw-only; the result is one-read and must never be retried.
export type TermStatus = "found" | "not_found" | "review"
export type TermField = {
  id: string
  label: string
  status: TermStatus
  value: string | null
  claim: { page: number; anchor_id: string; quote: string } | null
}
export type TermIsolationArtifact = { type: "term-isolation"; version: 1; fields: TermField[] }
export type TermVisualEvidence = { field_id: string; page: number; quote: string; kind: "native_text" | "local_ocr"; match: "exact"; boxes: Array<{ x: number; y: number; width: number; height: number }> }
export type TermIsolationResult = { artifact: TermIsolationArtifact; visual_evidence: TermVisualEvidence[] }

const TERM_IDS = ["buyer", "seller", "property_address", "purchase_price", "deposit", "deposit_holder", "irrevocability", "completion_date", "requisition_date"]
const termKeys = (value: object) => Object.keys(value).join(",")
const nonBlank = (value: unknown, max: number): value is string => typeof value === "string" && value.trim() !== "" && value.length <= max

/** Strict closed-schema check (ADR-009 §4.1). Any mismatch throws; never coerces. */
export function parseTermArtifact(value: unknown): TermIsolationArtifact {
  const bad = () => new ApiError(502, "invalid_artifact", "Result failed validation — try again")
  if (!isObject(value) || termKeys(value) !== "type,version,fields") throw bad()
  const artifact = value as unknown as TermIsolationArtifact
  if (artifact.type !== "term-isolation" || artifact.version !== 1 || !Array.isArray(artifact.fields) || artifact.fields.length !== TERM_IDS.length) throw bad()
  artifact.fields.forEach((field, index) => {
    if (!isObject(field) || termKeys(field) !== "id,label,status,value,claim" || field.id !== TERM_IDS[index] || !nonBlank(field.label, 500)) throw bad()
    if (field.status === "not_found") { if (field.value !== null || field.claim !== null) throw bad(); return }
    if (field.status !== "found" && field.status !== "review") throw bad()
    if (field.status === "found" ? !nonBlank(field.value, 500) : field.value !== null) throw bad()
    const claim = field.claim
    if (!isObject(claim) || termKeys(claim) !== "page,anchor_id,quote") throw bad()
    if (!Number.isInteger(claim.page) || (claim.page as number) < 1 || typeof claim.anchor_id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(claim.anchor_id) || !nonBlank(claim.quote, 750)) throw bad()
    if (field.status === "found" && !(claim.quote as string).includes(field.value as string)) throw bad()
  })
  return artifact
}

function parseTermResult(value: unknown): TermIsolationResult {
  const bad = () => new ApiError(502, "invalid_artifact", "Result failed validation — try again")
  if (!isObject(value) || termKeys(value) !== "artifact,visual_evidence") throw bad()
  const artifact = parseTermArtifact(value.artifact)
  if (!Array.isArray(value.visual_evidence) || value.visual_evidence.length > TERM_IDS.length) throw bad()
  const claims = new Map(artifact.fields.flatMap((field) => field.claim ? [[field.id, field.claim]] : []))
  const fields = new Set<string>()
  const visual_evidence = value.visual_evidence.map((evidence) => {
    if (!isObject(evidence) || termKeys(evidence) !== "field_id,page,quote,kind,match,boxes" || !TERM_IDS.includes(evidence.field_id as typeof TERM_IDS[number]) || fields.has(evidence.field_id as string) || !Number.isInteger(evidence.page) || (evidence.page as number) < 1 || !nonBlank(evidence.quote, 750) || (evidence.kind !== "native_text" && evidence.kind !== "local_ocr") || evidence.match !== "exact" || !Array.isArray(evidence.boxes) || !evidence.boxes.length || evidence.boxes.length > 750) throw bad()
    const claim = claims.get(evidence.field_id as string)
    if (!claim || claim.page !== evidence.page || claim.quote !== evidence.quote) throw bad()
    if (!evidence.boxes.every((box) => isObject(box) && termKeys(box) === "x,y,width,height" && [box.x, box.y, box.width, box.height].every((n) => typeof n === "number" && Number.isFinite(n)) && (box.width as number) > 0 && (box.height as number) > 0)) throw bad()
    fields.add(evidence.field_id as string)
    return evidence as unknown as TermVisualEvidence
  })
  return { artifact, visual_evidence }
}

export async function submitTermIsolation(file: File): Promise<{ id: string; expires_at: string }> {
  const form = new FormData()
  form.append("file", file)
  return (await checked(await fetch(`${API_BASE}/raw/term-isolation`, { method: "POST", body: form }))).json()
}

/** One-read: POST only. Callers must not retry. */
export async function takeRawArtifact(id: string): Promise<TermIsolationResult> {
  return parseTermResult(await (await checked(await fetch(`${API_BASE}/jobs/${id}/result/raw-artifact/take`, { method: "POST", headers: { Accept: "application/vnd.tool-parse.term-evidence+json;version=1" } }))).json())
}

const termErrors: Record<string, string> = {
  invalid_source: "The document could not be read as a supported contract — check the file and try again",
  raw_artifact_limit: "You already have a term result waiting — copy or download it first, then try again in 15 minutes",
  raw_capacity_unavailable: "Term isolation is busy right now — try again in a few seconds",
  gone: "This result was already taken or has expired — run the extraction again",
  not_found: "Result not found — it may have been taken or expired",
  template_unmatched: "This document is not an OREA Form 100 Agreement of Purchase and Sale. Term isolation only supports Form 100 right now.",
}

/** Term-isolation errors: raw-specific wording first, then the shared map. */
export function termError(e: unknown): string {
  return e instanceof ApiError && termErrors[e.code] ? termErrors[e.code] : friendlyError(e)
}
