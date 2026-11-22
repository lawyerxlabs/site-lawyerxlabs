import { useEffect, useRef } from "react"

// Only hand off focus when it still belongs to the dedicated processing message.
export function useProcessingFocus(busy: boolean) {
  const processingRef = useRef<HTMLParagraphElement>(null)
  const destinationRef = useRef<HTMLHeadingElement | HTMLDivElement>(null)
  const handoff = useRef(false)
  const captureFocus = () => { handoff.current = document.activeElement === processingRef.current }
  useEffect(() => {
    if (!busy && handoff.current) {
      handoff.current = false
      if (document.activeElement === document.body) destinationRef.current?.focus()
    }
  }, [busy])
  return { processingRef, destinationRef, captureFocus }
}
