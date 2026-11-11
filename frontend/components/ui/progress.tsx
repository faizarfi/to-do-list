import * as React from "react";

import { cn } from "@/lib/utils";

interface ProgressProps extends React.ProgressHTMLAttributes<HTMLProgressElement> {
  value?: number;
  max?: number;
  label?: string;
}

export function Progress({
  value,
  max = 100,
  label,
  className,
  ...props
}: ProgressProps) {
  const clamped =
    typeof value === "number" ? Math.min(Math.max(value, 0), max) : undefined;

  return (
    <progress
      aria-label={label}
      max={max}
      value={clamped}
      className={cn("rk-progress block h-2 w-full", className)}
      {...props}
    />
  );
}
