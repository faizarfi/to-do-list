import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-[var(--brand-subtle-border)] bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]",
        secondary:
          "border-[var(--border-subtle)] bg-[var(--surface-muted)] text-[var(--text-secondary)]",
        outline:
          "border-[var(--border-default)] bg-transparent text-[var(--text-secondary)]",
        success:
          "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-fg)]",
        warning:
          "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-fg)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

