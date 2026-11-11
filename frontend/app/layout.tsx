import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { ThemeSync } from "@/components/layout/theme-sync";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RuangKerja — 100 Personal Productivity Tools",
    template: "%s | RuangKerja",
  },
  description:
    "RuangKerja menyediakan 100 alat produktivitas profesional untuk PDF, gambar, Excel/CSV, kalkulator, pekerjaan harian, developer, keamanan, dan bisnis secara cepat dan aman.",
};

const FOUC_THEME_SCRIPT = `
try {
  var saved = localStorage.getItem("color-scheme");
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) {
    meta.content = saved === "light" || saved === "dark" ? saved : "light dark";
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: FOUC_THEME_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

