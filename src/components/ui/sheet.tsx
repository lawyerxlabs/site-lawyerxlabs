import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description
export const SheetContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  ({ className, children, ...props }, ref) => <DialogPrimitive.Portal><DialogPrimitive.Overlay className="ll-sheet-overlay" /><DialogPrimitive.Content ref={ref} className={cn("ll-sheet-content", className)} {...props}>{children}<DialogPrimitive.Close className="ll-sheet-close" aria-label="Close"><X size={18} /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>,
)
SheetContent.displayName = DialogPrimitive.Content.displayName
