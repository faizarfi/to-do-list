import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 min-h-9 px-4 py-2 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--brand-primary)] text-[var(--brand-primary-fg)] hover:bg-[var(--brand-primary-hover)] shadow-xs",
        secondary:
          "bg-[var(--surface-muted)] text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)]",
        outline:
          "border border-[var(--border-default)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]",
        ghost:
          "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]",
        destructive:
          "bg-[var(--danger-bg)] text-[var(--danger-fg)] hover:opacity-90",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-lg px-5 text-sm",
        icon: "min-h-9 min-w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

