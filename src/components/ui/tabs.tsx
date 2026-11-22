import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

export const Tabs = forwardRef<ElementRef<typeof TabsPrimitive.Root>, ComponentPropsWithoutRef<typeof TabsPrimitive.Root>>(
  ({ className, ...props }, ref) => <TabsPrimitive.Root ref={ref} className={cn("ll-tabs", className)} {...props} />,
)
Tabs.displayName = TabsPrimitive.Root.displayName

export const TabsList = forwardRef<ElementRef<typeof TabsPrimitive.List>, ComponentPropsWithoutRef<typeof TabsPrimitive.List>>(
  ({ className, ...props }, ref) => <TabsPrimitive.List ref={ref} className={cn("ll-tablist", className)} {...props} />,
)
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>(
  ({ className, ...props }, ref) => <TabsPrimitive.Trigger ref={ref} className={cn("ll-tab", className)} {...props} />,
)
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = forwardRef<ElementRef<typeof TabsPrimitive.Content>, ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>(
  ({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn("ll-tabpanel", className)} {...props} />,
)
TabsContent.displayName = TabsPrimitive.Content.displayName
