import { useEffect, useRef, type RefObject } from "react"
import { Progress } from "@/components/ui/progress"

/** Presentation only: the owning workflow supplies its actual pending state. */
export function ProcessingState({ message, focusOnMount = false, statusRef }: { message: string; focusOnMount?: boolean; statusRef?: RefObject<HTMLParagraphElement | null> }) {
  const fallback = useRef<HTMLParagraphElement>(null)
  const status = statusRef ?? fallback
  useEffect(() => { if (focusOnMount) status.current?.focus() }, [])
  return (
    <div className="processing-state">
      <p ref={status} tabIndex={focusOnMount ? -1 : undefined} className="processing-state-message" role="status" aria-atomic="true">{message}</p>
      <Progress aria-label={message} />
    </div>
  )
}
