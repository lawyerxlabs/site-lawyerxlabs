// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SessionSourceIntake } from '@/components/intake/SessionSourceIntake'
import { useState } from 'react'

afterEach(cleanup)
it('preserves pasted text when switching input methods and submits only the active method', () => {
  function Example() {
    const [mode, setMode] = useState<'file' | 'text'>('file')
    const [text, setText] = useState('')
    return <SessionSourceIntake modes={['file', 'text']} mode={mode} onMode={setMode} file={null} onFile={vi.fn()} text={text} onText={setText} busy={false} acceptedFileTypes={['.pdf']} />
  }
  render(<Example />)
  fireEvent.click(screen.getByLabelText('Paste text'))
  fireEvent.change(screen.getByLabelText('Paste source text'), { target: { value: 'source' } })
  fireEvent.click(screen.getByLabelText('Upload file'))
  fireEvent.click(screen.getByLabelText('Paste text'))
  expect((screen.getByLabelText('Paste source text') as HTMLTextAreaElement).value).toBe('source')
})

it('supports keyboard selection and exposes the paste label and byte guidance', async () => {
  const userEvent = (await import('@testing-library/user-event')).default
  const user = userEvent.setup()
  function Example() {
    const [mode, setMode] = useState<'file' | 'text'>('file')
    const [text, setText] = useState('')
    return <SessionSourceIntake modes={['file', 'text']} mode={mode} onMode={setMode} file={null} onFile={vi.fn()} text={text} onText={setText} busy={false} acceptedFileTypes={['.pdf']} />
  }
  render(<Example />)
  await user.tab()
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Upload file' }))
  await user.keyboard('{ArrowRight}')
  expect((screen.getByRole('radio', { name: 'Paste text' }) as HTMLInputElement).checked).toBe(true)
  await user.tab()
  const input = screen.getByRole('textbox', { name: 'Paste source text' })
  expect(document.activeElement).toBe(input)
  expect(input.getAttribute('aria-describedby')).toBe('session-source-text-bytes')
  await user.type(input, 'Synthetic text')
  expect((input as HTMLTextAreaElement).value).toBe('Synthetic text')
})
