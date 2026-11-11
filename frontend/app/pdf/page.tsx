import { Suspense } from "react";
import type { Metadata } from "next";

import { CategoryWorkspace } from "@/components/workspace/category-workspace";

export const metadata: Metadata = {
  title: "PDF & Dokumen",
};

export default function PdfToolsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-[var(--surface-muted)]" />}>
      <CategoryWorkspace categoryId="pdf" />
    </Suspense>
  );
}

