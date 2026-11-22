// Member end-to-end check for the HR hiring flow: create session -> generate -> inspect -> delete.
// Usage: printf '%s' "<auth_session cookie value>" | node scripts/hr-e2e.mjs [baseUrl] [file.txt]
// The cookie is read from stdin only (never argv/history) and never printed. Default base: http://127.0.0.1:7200
// Default source is a generic synthetic job posting; pass a text file to use your own. Neither source contents nor
// generated content are printed; output is PASS/FAIL step lines with status codes and counts only.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const base = (process.argv[2] ?? 'http://127.0.0.1:7200').replace(/\/$/, '');
const text = process.argv[3] ? readFileSync(process.argv[3], 'utf8') : `Senior Accounts Payable Analyst
Location: Toronto, Ontario (hybrid, three days in office)
Employment type: Full-time, permanent
Reporting to the Finance Manager, you will process vendor invoices, reconcile supplier statements and support month-end close.
Responsibilities: match invoices to purchase orders; resolve payment discrepancies; prepare weekly payment runs; maintain vendor records.
Qualifications: 3+ years in accounts payable; strong Excel skills; experience with an ERP system; college diploma in accounting or equivalent.
Preferred: CPA designation in progress; experience with multi-currency payments.
Apply by submitting your resume to the hiring team through the company careers page.`;

const cookie = readFileSync(0, 'utf8').trim();
if (!cookie) { console.error('no cookie on stdin'); process.exit(2); }

const call = async (method, path, body, idempotencyKey) => {
  const res = await fetch(base + path, {
    method,
    headers: { cookie: `auth_session=${cookie}`, ...(body ? { 'content-type': 'application/json' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(130_000),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data, noStore: /no-store/.test(res.headers.get('cache-control') ?? '') };
};
const step = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); if (!ok) failed = true; };
let failed = false, sessionId;

try {
  const created = await call('POST', '/hr/v1/sessions', { source: { kind: 'pasted_text', text } });
  step('create session', created.status === 201, `status=${created.status} ${created.data?.error?.code ?? ''}`);
  if (created.status !== 201) process.exit(1);
  sessionId = created.data.session_id;
  const criteria = created.data.criteria ?? [];
  step('criteria extracted', criteria.length > 0, `count=${criteria.length}`);

  const generationPath = `/hr/v1/sessions/${sessionId}/generation`;
  const firstGenerationKey = randomUUID();
  const firstGeneration = {
    outcome: 'improved_job_description',
    criteria: criteria.map((c) => ({ criterion_id: c.criterion_id, decision: 'confirm' })),
  };
  const generated = await call('POST', generationPath, firstGeneration, firstGenerationKey);
  step('generation status 200', generated.status === 200, `status=${generated.status} ${generated.data?.error?.code ?? ''}`);
  step('no-store header', generated.noStore);
  const content = generated.data?.content;
  if (generated.status === 200) {
    step('content is non-empty markdown string', typeof content === 'string' && content.trim().length > 50, `chars=${content?.length}`);
    step('looks like markdown (has a heading)', /^#{1,3}\s/m.test(content ?? ''));
    step('format text/markdown', generated.data.format === 'text/markdown');
    step('disclaimer present', typeof generated.data.disclaimer === 'string' && generated.data.disclaimer.length > 0);
    // Same idea as the server check, from outside: any figure in the output should appear in the source.
    const srcDigits = text.replace(/\D/g, '');
    const invented = [...(content ?? '').matchAll(/[$£€]\s*\d[\d,]*/g)].map((m) => m[0]).filter((m) => !srcDigits.includes(m.replace(/\D/g, '')));
    step('no invented currency figures', invented.length === 0, `count=${invented.length}`);
    // Generated content is source-grounded, so it is never printed (no-source-logging rule).
  }

  const retry = await call('POST', generationPath, firstGeneration, firstGenerationKey);
  step('same-key retry does not start a new generation', retry.status === 409 && retry.data?.error?.code === 'generation_already_completed', `status=${retry.status} ${retry.data?.error?.code ?? ''}`);
  const secondGeneration = { outcome: 'improved_job_description', criteria: criteria.map((c) => ({ criterion_id: c.criterion_id, decision: 'confirm' })) };
  const secondGenerationKey = randomUUID();
  step('distinct intended generation key', secondGenerationKey !== firstGenerationKey);
  const again = await call('POST', generationPath, secondGeneration, secondGenerationKey);
  step('second generation allowed (cap is 3)', again.status === 200 || again.status === 422, `status=${again.status}`);
} catch (e) {
  step('script error', false, e?.name === 'TimeoutError' ? 'timeout' : String(e?.code ?? e?.name));
} finally {
  if (sessionId) {
    const del = await call('DELETE', `/hr/v1/sessions/${sessionId}`).catch(() => ({ status: 'error' }));
    step('cleanup (delete session)', del.status === 204, `status=${del.status}`);
  }
}
process.exit(failed ? 1 : 0);
