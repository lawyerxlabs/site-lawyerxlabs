import { forwardRef, type ButtonHTMLAttributes } from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

export const buttonVariants = cva("ll-button", {
  variants: {
    variant: {
      primary: "ll-button-primary",
      secondary: "ll-button-secondary",
      destructive: "ll-button-destructive",
      ghost: "ll-button-ghost",
    },
    size: { default: "ll-button-default", sm: "ll-button-sm", icon: "ll-button-icon" },
  },
  defaultVariants: { variant: "primary", size: "default" },
})

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean }

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ asChild, className, variant, size, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = "Button"
