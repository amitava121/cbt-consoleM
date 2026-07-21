import { forwardRef, type TextareaHTMLAttributes } from "react";

const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={`flex min-h-[80px] w-full rounded-lg border border-border/80 bg-background/60 px-3.5 py-2 text-sm shadow-xs transition-all duration-200 outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:bg-background/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-card/40 ${className ?? ""}`}
    {...props}
  />
));

Textarea.displayName = "Textarea";

export { Textarea };
