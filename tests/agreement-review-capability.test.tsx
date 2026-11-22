// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Playground } from '@/pages/Playground'
const state = vi.hoisted(() => ({ catalog: null as null | any[] }))
vi.mock('@/lib/useTier', () => ({ useTier: () => ({ signedIn: false, ready: true, me: null }) }))
vi.mock('@/components/Shell', () => ({ Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/WorkflowPage', () => ({ WorkflowPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/AgreementReview', () => ({ AgreementReview: () => <div>Agreement intake mounted</div> }))
vi.mock('@/lib/useWorkflowCapabilities', async (original) => ({ ...(await original<typeof import('@/lib/useWorkflowCapabilities')>()), useWorkflowCatalog: () => state.catalog, refreshWorkflowCapabilities: async () => state.catalog, useResolvedWorkflow: (workflow: unknown) => workflow }))
afterEach(() => { cleanup(); state.catalog = null })
const capability = { id: 'agreement-review', identity_requirement: 'public', intake_modes: ['file'], accepted_file_types: ['.pdf', '.docx'], pii_profile: 'protected-document', handling: { capability: 'fixed', choices: ['pseudonymise'], default: 'pseudonymise' }, results: { markdown: false, report: false, artifact: true } }
function mount() { render(<MemoryRouter initialEntries={['/playground/?workflow=agreement-review']}><Playground /></MemoryRouter>) }
it('keeps disabled agreement intake unmounted even with a valid public capability', () => { state.catalog = [capability]; mount(); expect(screen.getByText('Launching soon')).toBeTruthy(); expect(screen.queryByText('Agreement intake mounted')).toBeNull() })
it('fails closed when capabilities are unavailable or have incompatible handling', () => { mount(); expect(screen.queryByText('Agreement intake mounted')).toBeNull(); cleanup(); state.catalog = [{ ...capability, handling: { capability: 'fixed', choices: ['redact'], default: 'redact' } }]; mount(); expect(screen.queryByText('Agreement intake mounted')).toBeNull() })
it('fails closed when the privacy profile or accepted file types differ', () => { state.catalog = [{ ...capability, pii_profile: 'public-redaction' }]; mount(); expect(screen.queryByText('Agreement intake mounted')).toBeNull(); cleanup(); state.catalog = [{ ...capability, accepted_file_types: [] }]; mount(); expect(screen.queryByText('Agreement intake mounted')).toBeNull() })
