import { useState } from "react"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"

type CopyControlProps = {
  content: string
  label: string
  failureMessage?: string
}

export function CopyControl({ content, label, failureMessage = "Copy failed. Clipboard access was unavailable. Try again." }: CopyControlProps) {
  const [status, setStatus] = useState("")
  const subject = label.charAt(0).toUpperCase() + label.slice(1)

  async function copy() {
    try {
      await navigator.clipboard.writeText(content)
      setStatus(`${subject} copied.`)
    } catch {
      setStatus(failureMessage)
    }
  }

  return <>
    <Button type="button" variant="secondary" aria-label={`Copy ${label}`} onClick={copy}>
      <Copy size={15} aria-hidden="true" /> Copy
    </Button>
    <span role="status" aria-live="polite" aria-atomic="true">{status}</span>
  </>
}
