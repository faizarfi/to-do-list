import { Suspense } from "react";
import type { Metadata } from "next";

import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-16 w-72 animate-pulse rounded-xl bg-[var(--surface-muted)]" />
          <div className="h-28 w-full animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
        </div>
      }
    >
      <DashboardView />
    </Suspense>
  );
}

