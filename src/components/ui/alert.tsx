import { forwardRef, type HTMLAttributes } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const alertVariants = cva("ll-alert", { variants: { variant: { default: "", destructive: "ll-alert-destructive" } }, defaultVariants: { variant: "default" } })
type AlertProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
export const Alert = forwardRef<HTMLDivElement, AlertProps>(({ className, variant, ...props }, ref) => <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />)
Alert.displayName = "Alert"
