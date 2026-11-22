import { afterEach, expect, it, vi } from 'vitest'
import { submitAgreementReview } from '@/lib/api'

afterEach(() => vi.restoreAllMocks())
it('submits one file and verification token, and accepts only the fixed artifact', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ artifact: { claims: [{ documentId: 'agreement', anchorId: 'page-1', quote: 'protected text', finding: 'Terms' }] }, notice: 'Review' }), { status: 200 }))
  const result = await submitAgreementReview(new File(['%PDF'], 'a.pdf'), 'token')
  expect(result.artifact.claims[0].finding).toBe('Terms')
  expect(fetch.mock.calls[0][0]).toBe('/v1/agreement-review')
  const form = fetch.mock.calls[0][1]?.body as FormData
  expect(form.get('cf_turnstile_response')).toBe('token')
  expect(form.get('file')).toBeInstanceOf(File)
})
it('rejects incompatible result shapes rather than rendering unexpected data', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ artifact: { claims: [], source: 'extra' }, notice: 'Review' }), { status: 200 }))
  await expect(submitAgreementReview(new File(['%PDF'], 'a.pdf'), 'token')).rejects.toMatchObject({ code: 'incompatible_artifact' })
})
it('rejects malformed result JSON as an incompatible artifact', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 200 }))
  await expect(submitAgreementReview(new File(['%PDF'], 'a.pdf'), 'token')).rejects.toMatchObject({ code: 'incompatible_artifact' })
})
