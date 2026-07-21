import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-border/80 bg-background/60 px-3.5 py-2 text-sm shadow-xs transition-all duration-200 outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/70 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card/40",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:bg-background/90",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  )
}


export { Input }
