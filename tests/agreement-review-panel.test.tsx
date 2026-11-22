// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AgreementReview } from '@/components/AgreementReview'
import * as api from '@/lib/api'
import { CATALOG } from '@/lib/workflows'

vi.mock('@/components/WorkflowPage', () => ({ WorkflowPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/FileIntake', () => ({ FileIntake: ({ onSubmit }: { onSubmit: (file: File, token: string) => void }) => <button onClick={() => onSubmit(new File(['%PDF'], 'a.pdf'), 'token')}>Submit file</button> }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('shows protected excerpts and findings as text and supports starting over', async () => {
  vi.spyOn(api, 'submitAgreementReview').mockResolvedValue({ artifact: { claims: [{ documentId: 'agreement', anchorId: 'page-1', quote: '<img src=x onerror=alert(1)>', finding: 'Review payment terms' }] }, notice: 'Review this draft.' })
  render(<AgreementReview workflow={CATALOG.find((w) => w.id === 'agreement-review')!} />)
  fireEvent.click(screen.getByText('Submit file'))
  expect(await screen.findByText('Review payment terms')).toBeTruthy()
  expect(screen.getByText('<img src=x onerror=alert(1)>').querySelector('img')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
  expect(screen.queryByText('Review payment terms')).toBeNull()
})
it('copies the findings and notice for review', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  vi.spyOn(api, 'submitAgreementReview').mockResolvedValue({ artifact: { claims: [{ documentId: 'agreement', anchorId: 'page-1', quote: 'Protected excerpt', finding: 'Review payment terms' }] }, notice: 'Review this draft.' })
  render(<AgreementReview workflow={CATALOG.find((w) => w.id === 'agreement-review')!} />)
  fireEvent.click(screen.getByText('Submit file'))
  fireEvent.click(await screen.findByRole('button', { name: 'Copy agreement analysis' }))
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Protected excerpt'))
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Review this draft.'))
  expect(await screen.findByText('Agreement analysis copied.')).toBeTruthy()
})

it('announces copy failure with a recovery action', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } })
  vi.spyOn(api, 'submitAgreementReview').mockResolvedValue({ artifact: { claims: [] }, notice: 'Review this draft.' })
  render(<AgreementReview workflow={CATALOG.find((w) => w.id === 'agreement-review')!} />)
  fireEvent.click(screen.getByText('Submit file'))
  fireEvent.click(await screen.findByRole('button', { name: 'Copy agreement analysis' }))
  expect(await screen.findByText('Copy failed. Use Download analysis instead.')).toBeTruthy()
})
