import type { HTMLAttributes } from "react"
import { cn } from "@/lib/utils"

export function Progress({ className, value, ...props }: HTMLAttributes<HTMLDivElement> & { value?: number }) {
  const indeterminate = value === undefined
  return (
    <div
      role="progressbar"
      aria-busy={indeterminate}
      aria-label="Loading"
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("ll-progress", indeterminate && "ll-progress-indeterminate", className)}
      {...props}
    >
      <div className="ll-progress-bar" style={indeterminate ? undefined : { width: `${value}%` }} />
    </div>
  )
}
