"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  Download,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  decodeBase64ToUtf8,
  decodeJwtToken,
  encodeUtf8ToBase64,
  escapeHtmlEntities,
  formatHtmlXml,
  formatJsonInput,
  formatSqlQuery,
  parseCronSchedule,
  unescapeHtmlEntities,
} from "@/lib/dev-tools";
import { convertYamlJson } from "@/lib/extra-api";
import { cn } from "@/lib/utils";
import type { ToolDefinition } from "@/types/tools";

const SAMPLE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEwMSIsIm5hbWUiOiJBbmRpIFNhbnRvc28iLCJyb2xlIjoiQWRtaW4iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTg5MDAwMDAwMH0.signature-demo-token";

const SAMPLE_JSON_DEV = `{
  "aplikasi": "RuangKerja",
  "versi": "2.0.0",
  "fitur": ["PDF", "Gambar", "Excel", "Developer"],
  "aktif": true
}`;

const SAMPLE_YAML_DEV = `aplikasi: RuangKerja
versi: 2.0.0
server:
  host: 127.0.0.1
  port: 8000
fitur:
  - PDF
  - Gambar
  - Excel
`;

function hexToRgbTuple(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHslString(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const chans = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chans[0] + 0.7152 * chans[1] + 0.0722 * chans[2];
}

function downloadTextArtifact(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DeveloperWorkspace({ tool }: { tool: ToolDefinition }) {
  const formId = useId();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // #79 JSON Formatter
  const [jsonIn, setJsonIn] = useState(SAMPLE_JSON_DEV);
  const [jsonMode, setJsonMode] = useState<"pretty" | "minify" | "sort_keys">("pretty");

  // #80 JWT Decoder
  const [jwtIn, setJwtIn] = useState(SAMPLE_JWT);

  // #81 Regex Tester
  const [regexPattern, setRegexPattern] = useState("(\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b)");
  const [regexFlags, setRegexFlags] = useState("gi");
  const [regexText, setRegexText] = useState(
    "Hubungi admin@ruangkerja.local atau support@contoh.id sebelum pukul 17:00."
  );
  const [regexReplace, setRegexReplace] = useState("[EMAIL]");

  // #82 Base64
  const [b64Mode, setB64Mode] = useState<"encode" | "decode">("encode");
  const [b64UrlSafe, setB64UrlSafe] = useState(false);
  const [b64Input, setB64Input] = useState("Halo RuangKerja 2026 🚀");

  // #83 URL Encoder & Parser
  const [urlInput, setUrlInput] = useState(
    "https://ruangkerja.local/pdf?tool=merge-pdf&kualitas=tinggi&halaman=1%202"
  );
  const [urlCompText, setUrlCompText] = useState("Laporan Keuangan Q1 & Q2 (2026)");

  // #84 Unix Timestamp
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [epochIn, setEpochIn] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [dateTimeIn, setDateTimeIn] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  });

  // #85 Color & WCAG Contrast
  const [fgColor, setFgColor] = useState("#0F172A");
  const [bgColor, setBgColor] = useState("#ECFDF5");

  // #86 SQL Formatter
  const [sqlIn, setSqlIn] = useState(
    "select u.id, u.nama, count(t.id) as total_tugas from users u left join todos t on t.user_id = u.id where u.aktif = 1 group by u.id, u.nama order by total_tugas desc limit 10"
  );

  // #87 HTML / XML Formatter & Escape
  const [htmlMode, setHtmlMode] = useState<"beautify" | "minify" | "escape" | "unescape">("beautify");
  const [htmlIn, setHtmlIn] = useState(
    `<div class="kartu"><h2>RuangKerja</h2><p>Alat <strong>produktivitas</strong> modern.</p></div>`
  );

  // #88 CSS Box Shadow & Border Radius Studio
  const [cssX, setCssX] = useState(0);
  const [cssY, setCssY] = useState(12);
  const [cssBlur, setCssBlur] = useState(28);
  const [cssSpread, setCssSpread] = useState(-4);
  const [cssShadowHex, setCssShadowHex] = useState("#0D7A68");
  const [cssOpacity, setCssOpacity] = useState(0.22);
  const [cssInset, setCssInset] = useState(false);
  const [cssRadius, setCssRadius] = useState(16);

  // #89 YAML <-> JSON
  const [yamlDir, setYamlDir] = useState<"yaml_to_json" | "json_to_yaml">("yaml_to_json");
  const [yamlIn, setYamlIn] = useState(SAMPLE_YAML_DEV);
  const [yamlIndent, setYamlIndent] = useState(2);
  const [yamlOut, setYamlOut] = useState("");
  const [yamlLoading, setYamlLoading] = useState(false);
  const [yamlError, setYamlError] = useState<string | null>(null);

  // #90 Cron Parser
  const [cronExpr, setCronExpr] = useState("*/15 9-17 * * 1-5");

  useEffect(() => {
    if (tool.id !== "unix-timestamp-converter") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [tool.id]);

  async function copyText(key: string, val: string) {
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  }

  // Computed results
  const jsonComputed = useMemo(() => {
    if (!jsonIn.trim()) return { output: "", keysCount: 0, error: null };
    try {
      return { ...formatJsonInput(jsonIn, jsonMode), error: null };
    } catch (err) {
      return {
        output: "",
        keysCount: 0,
        error: err instanceof Error ? err.message : "Sintaks JSON tidak valid.",
      };
    }
  }, [jsonIn, jsonMode]);

  const jwtComputed = useMemo(() => {
    if (!jwtIn.trim()) return { data: null, error: null };
    try {
      return { data: decodeJwtToken(jwtIn), error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : "Token JWT tidak valid.",
      };
    }
  }, [jwtIn]);

  const regexComputed = useMemo(() => {
    if (!regexPattern) return { matches: [], replaced: regexText, error: null };
    try {
      const safeFlags = regexFlags.includes("g") ? regexFlags : `${regexFlags}g`;
      const re = new RegExp(regexPattern, safeFlags);
      const matches: { match: string; index: number; groups: string[] }[] = [];
      let guard = 0;
      for (const m of regexText.matchAll(re)) {
        matches.push({
          match: m[0],
          index: m.index ?? 0,
          groups: m.slice(1).map((g) => g ?? ""),
        });
        guard += 1;
        if (guard >= 200) break;
      }
      const replaced = regexText.replace(re, regexReplace);
      return { matches, replaced, error: null };
    } catch (err) {
      return {
        matches: [],
        replaced: regexText,
        error: err instanceof Error ? err.message : "Pola RegExp tidak valid.",
      };
    }
  }, [regexPattern, regexFlags, regexText, regexReplace]);

  const b64Computed = useMemo(() => {
    if (!b64Input) return { output: "", error: null };
    try {
      if (b64Mode === "encode") {
        let out = encodeUtf8ToBase64(b64Input);
        if (b64UrlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        return { output: out, error: null };
      }
      const normalized = b64Input.replace(/-/g, "+").replace(/_/g, "/");
      return { output: decodeBase64ToUtf8(normalized), error: null };
    } catch {
      return {
        output: "",
        error: "Input Base64 tidak valid atau bukan karakter UTF-8 yang sah.",
      };
    }
  }, [b64Mode, b64UrlSafe, b64Input]);

  const parsedUrl = useMemo(() => {
    try {
      const u = new URL(urlInput.trim());
      return {
        ok: true as const,
        protocol: u.protocol,
        host: u.host,
        pathname: u.pathname,
        hash: u.hash,
        params: Array.from(u.searchParams.entries()),
      };
    } catch {
      return { ok: false as const };
    }
  }, [urlInput]);

  const cronComputed = useMemo(() => {
    try {
      return { data: parseCronSchedule(cronExpr, 6), error: null };
    } catch (err) {
      return {
        data: null,
        error: err instanceof Error ? err.message : "Ekspresi cron tidak valid.",
      };
    }
  }, [cronExpr]);

  // =========================================================================
  // #79 JSON FORMATTER & VALIDATOR
  // =========================================================================
  if (tool.id === "json-formatter-validator") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["pretty", "Rapikan (2 Spasi)"],
                ["minify", "Minify (1 Baris)"],
                ["sort_keys", "Urutkan Key A–Z"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setJsonMode(m)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium",
                  jsonMode === m
                    ? "border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {jsonComputed.error ? (
              <Badge variant="warning">JSON Tidak Valid</Badge>
            ) : jsonComputed.output ? (
              <Badge variant="success">Valid ({jsonComputed.keysCount} key level atas)</Badge>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setJsonIn(SAMPLE_JSON_DEV)}
            >
              Contoh JSON
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-jin`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Input JSON
            </label>
            <textarea
              id={`${formId}-jin`}
              rows={12}
              value={jsonIn}
              onChange={(e) => setJsonIn(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Hasil Terformat
              </span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!jsonComputed.output}
                  onClick={() => void copyText("json", jsonComputed.output)}
                >
                  {copiedKey === "json" ? (
                    <Check className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedKey === "json" ? "Tersalin!" : "Salin"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!jsonComputed.output}
                  onClick={() => downloadTextArtifact("formatted.json", jsonComputed.output)}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>.json</span>
                </Button>
              </div>
            </div>
            <pre className="mt-1 h-[268px] overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3 font-mono text-xs text-[var(--text-primary)]">
              {jsonComputed.error ? jsonComputed.error : jsonComputed.output || "—"}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #80 JWT DECODER
  // =========================================================================
  if (tool.id === "jwt-decoder") {
    return (
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-2">
          <div className="flex-1">
            <label htmlFor={`${formId}-jwt`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Tempel Token JWT (Header.Payload.Signature)
            </label>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setJwtIn(SAMPLE_JWT)}>
            Contoh JWT
          </Button>
        </div>
        <textarea
          id={`${formId}-jwt`}
          rows={3}
          value={jwtIn}
          onChange={(e) => setJwtIn(e.target.value)}
          className="w-full break-all rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
        />

        {jwtComputed.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {jwtComputed.error}
          </p>
        )}

        {jwtComputed.data && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {jwtComputed.data.isExpired === true ? (
                <Badge variant="warning">Kedaluwarsa (Expired)</Badge>
              ) : jwtComputed.data.isExpired === false ? (
                <Badge variant="success">Belum Kedaluwarsa</Badge>
              ) : (
                <Badge variant="outline">Tanpa klaim exp</Badge>
              )}
              {jwtComputed.data.issuedAtIso && (
                <Badge variant="outline">iat: {jwtComputed.data.issuedAtIso}</Badge>
              )}
              {jwtComputed.data.expiresAtIso && (
                <Badge variant="outline">exp: {jwtComputed.data.expiresAtIso}</Badge>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Header</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void copyText(
                        "jwth",
                        JSON.stringify(jwtComputed.data?.header, null, 2)
                      )
                    }
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>{copiedKey === "jwth" ? "Tersalin!" : "Salin"}</span>
                  </Button>
                </div>
                <pre className="overflow-auto rounded-lg bg-[var(--surface-muted)]/50 p-2.5 font-mono text-xs text-[var(--text-primary)]">
                  {JSON.stringify(jwtComputed.data.header, null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Payload</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void copyText(
                        "jwtp",
                        JSON.stringify(jwtComputed.data?.payload, null, 2)
                      )
                    }
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>{copiedKey === "jwtp" ? "Tersalin!" : "Salin"}</span>
                  </Button>
                </div>
                <pre className="overflow-auto rounded-lg bg-[var(--surface-muted)]/50 p-2.5 font-mono text-xs text-[var(--text-primary)]">
                  {JSON.stringify(jwtComputed.data.payload, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // #81 REGEX TESTER
  // =========================================================================
  if (tool.id === "regex-tester") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
          <div>
            <label htmlFor={`${formId}-repat`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Pola Regular Expression
            </label>
            <Input
              id={`${formId}-repat`}
              value={regexPattern}
              onChange={(e) => setRegexPattern(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <div>
            <label htmlFor={`${formId}-reflag`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Flags (mis. gi)
            </label>
            <Input
              id={`${formId}-reflag`}
              value={regexFlags}
              onChange={(e) => setRegexFlags(e.target.value.replace(/[^gimsuy]/g, ""))}
              className="mt-1 font-mono"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-[var(--text-muted)]">Preset:</span>
          {[
            { label: "Email", pat: "([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})" },
            { label: "Tanggal YYYY-MM-DD", pat: "(\\d{4}-\\d{2}-\\d{2})" },
            { label: "URL", pat: "(https?:\\/\\/[^\\s]+)" },
            { label: "No HP ID", pat: "((?:\\+62|0)8\\d{7,11})" },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setRegexPattern(p.pat)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <label htmlFor={`${formId}-retxt`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Teks Uji Coba
          </label>
          <textarea
            id={`${formId}-retxt`}
            rows={4}
            value={regexText}
            onChange={(e) => setRegexText(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
          />
        </div>

        {regexComputed.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {regexComputed.error}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="success">{regexComputed.matches.length} Kecocokan Ditemukan</Badge>
            </div>
            {regexComputed.matches.length > 0 && (
              <div
                role="region"
                aria-label="Daftar kecocokan RegExp"
                tabIndex={0}
                className="max-h-48 overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
              >
                <table className="w-full text-left font-mono text-xs">
                  <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60">
                    <tr>
                      <th className="px-3 py-1.5">#</th>
                      <th className="px-3 py-1.5">Index</th>
                      <th className="px-3 py-1.5">Kecocokan</th>
                      <th className="px-3 py-1.5">Grup ($1..)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regexComputed.matches.map((m, idx) => (
                      <tr key={idx} className="border-b border-[var(--border-subtle)]/50 last:border-b-0">
                        <td className="px-3 py-1">{idx + 1}</td>
                        <td className="px-3 py-1">{m.index}</td>
                        <td className="px-3 py-1 font-semibold text-[var(--brand-primary)]">
                          {m.match}
                        </td>
                        <td className="px-3 py-1 text-[var(--text-secondary)]">
                          {m.groups.length > 0 ? m.groups.join(" | ") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-3">
              <label htmlFor={`${formId}-rerep`} className="text-xs font-medium text-[var(--text-secondary)]">
                Uji Replace ($1, $2 didukung)
              </label>
              <Input
                id={`${formId}-rerep`}
                value={regexReplace}
                onChange={(e) => setRegexReplace(e.target.value)}
                className="font-mono"
              />
              <pre className="whitespace-pre-wrap rounded-lg bg-[var(--surface-card)] p-2.5 font-mono text-xs text-[var(--text-primary)]">
                {regexComputed.replaced}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // #82 BASE64 ENCODER & DECODER
  // =========================================================================
  if (tool.id === "base64-encoder-decoder") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            {(
              [
                ["encode", "Encode (Teks → Base64)"],
                ["decode", "Decode (Base64 → Teks)"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setB64Mode(m)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium",
                  b64Mode === m
                    ? "border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={b64UrlSafe}
                onChange={(e) => setB64UrlSafe(e.target.checked)}
                className="h-3.5 w-3.5 rounded"
              />
              <span>URL-safe (- / _)</span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!b64Computed.output}
              onClick={() => {
                setB64Input(b64Computed.output);
                setB64Mode((m) => (m === "encode" ? "decode" : "encode"));
              }}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Tukar</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-b64in`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Input
            </label>
            <textarea
              id={`${formId}-b64in`}
              rows={7}
              value={b64Input}
              onChange={(e) => setB64Input(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Output</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!b64Computed.output}
                onClick={() => void copyText("b64", b64Computed.output)}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copiedKey === "b64" ? "Tersalin!" : "Salin"}</span>
              </Button>
            </div>
            <pre className="mt-1 h-[156px] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3 font-mono text-xs text-[var(--text-primary)]">
              {b64Computed.error ? b64Computed.error : b64Computed.output || "—"}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #83 URL ENCODER, DECODER & QUERY PARSER
  // =========================================================================
  if (tool.id === "url-encoder-parser") {
    let encodedUrlPart = "";
    let decodedUrlPart = "";
    try {
      encodedUrlPart = encodeURIComponent(urlCompText);
      decodedUrlPart = decodeURIComponent(urlCompText);
    } catch {
      decodedUrlPart = "Gagal decode string URI (persentase tidak lengkap).";
    }

    return (
      <div className="space-y-5">
        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Parser Struktur URL & Query Parameters
          </p>
          <div>
            <label htmlFor={`${formId}-urlfull`} className="block text-xs text-[var(--text-secondary)]">
              URL Lengkap
            </label>
            <Input
              id={`${formId}-urlfull`}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          {parsedUrl.ok ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-xs">
                <div className="rounded-lg bg-[var(--surface-muted)]/60 p-2.5">
                  <span className="text-[var(--text-muted)]">Protocol / Host:</span>
                  <p className="font-mono font-semibold text-[var(--text-primary)]">
                    {`${parsedUrl.protocol}//${parsedUrl.host}`}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--surface-muted)]/60 p-2.5">
                  <span className="text-[var(--text-muted)]">Pathname:</span>
                  <p className="font-mono font-semibold text-[var(--text-primary)]">
                    {parsedUrl.pathname}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--surface-muted)]/60 p-2.5">
                  <span className="text-[var(--text-muted)]">Hash:</span>
                  <p className="font-mono font-semibold text-[var(--text-primary)]">
                    {parsedUrl.hash || "—"}
                  </p>
                </div>
              </div>
              {parsedUrl.params.length > 0 && (
                <div className="rounded-lg border border-[var(--border-subtle)] overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-[var(--surface-muted)]/60 border-b border-[var(--border-subtle)]">
                      <tr>
                        <th className="px-3 py-1.5">Query Key</th>
                        <th className="px-3 py-1.5">Nilai Ter-decode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedUrl.params.map(([k, v], idx) => (
                        <tr key={`${k}-${idx}`} className="border-b border-[var(--border-subtle)]/50 last:border-b-0">
                          <td className="px-3 py-1.5 font-semibold text-[var(--brand-primary)]">{k}</td>
                          <td className="px-3 py-1.5 text-[var(--text-primary)]">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Masukkan URL lengkap diawali http:// atau https:// untuk membedah strukturnya.
            </p>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <label htmlFor={`${formId}-urlcomp`} className="block text-xs font-semibold text-[var(--text-primary)]">
            Encode / Decode Komponen URI
          </label>
          <Input
            id={`${formId}-urlcomp`}
            value={urlCompText}
            onChange={(e) => setUrlCompText(e.target.value)}
            className="font-mono"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-[var(--surface-muted)]/60 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Encoded (encodeURIComponent)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyText("uenc", encodedUrlPart)}
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  <span>{copiedKey === "uenc" ? "Tersalin!" : "Salin"}</span>
                </Button>
              </div>
              <p className="break-all font-mono text-xs text-[var(--text-primary)]">
                {encodedUrlPart}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-muted)]/60 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-[var(--text-muted)]">
                  Decoded (decodeURIComponent)
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyText("udec", decodedUrlPart)}
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  <span>{copiedKey === "udec" ? "Tersalin!" : "Salin"}</span>
                </Button>
              </div>
              <p className="break-all font-mono text-xs text-[var(--text-primary)]">
                {decodedUrlPart}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #84 UNIX TIMESTAMP CONVERTER
  // =========================================================================
  if (tool.id === "unix-timestamp-converter") {
    const rawNum = Number(epochIn.trim());
    const epochMs =
      Number.isFinite(rawNum) && epochIn.trim()
        ? Math.abs(rawNum) < 1e12
          ? rawNum * 1000
          : rawNum
        : null;
    const epochDate = epochMs !== null ? new Date(epochMs) : null;
    const validEpochDate = epochDate && !Number.isNaN(epochDate.getTime()) ? epochDate : null;

    const dtObj = new Date(dateTimeIn);
    const validDt = !Number.isNaN(dtObj.getTime()) ? dtObj : null;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4">
          <div>
            <p className="text-xs font-medium text-[var(--brand-primary)]">
              Epoch Saat Ini (Detik / Milidetik)
            </p>
            <p className="mt-0.5 font-mono text-xl font-bold tabular-nums text-[var(--text-primary)]">
              {Math.floor(nowMs / 1000)}{" "}
              <span className="text-xs font-normal text-[var(--text-secondary)]">
                ({nowMs} ms)
              </span>
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEpochIn(String(Math.floor(Date.now() / 1000)))}
          >
            Gunakan Sekarang
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <label htmlFor={`${formId}-ep`} className="block text-xs font-semibold text-[var(--text-primary)]">
              Epoch (Detik / Milidetik) → Tanggal
            </label>
            <Input
              id={`${formId}-ep`}
              value={epochIn}
              onChange={(e) => setEpochIn(e.target.value)}
              className="font-mono"
            />
            {validEpochDate ? (
              <div className="space-y-1.5 text-xs">
                <p>
                  <span className="text-[var(--text-muted)]">Lokal: </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {validEpochDate.toLocaleString("id-ID", {
                      dateStyle: "full",
                      timeStyle: "medium",
                    })}
                  </span>
                </p>
                <p>
                  <span className="text-[var(--text-muted)]">ISO 8601 (UTC): </span>
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {validEpochDate.toISOString()}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-xs text-red-500">Angka epoch tidak valid.</p>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <label htmlFor={`${formId}-dt`} className="block text-xs font-semibold text-[var(--text-primary)]">
              Tanggal & Jam Lokal → Unix Epoch
            </label>
            <Input
              id={`${formId}-dt`}
              type="datetime-local"
              value={dateTimeIn}
              onChange={(e) => setDateTimeIn(e.target.value)}
              className="font-mono"
            />
            {validDt && (
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    Detik: {Math.floor(validDt.getTime() / 1000)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void copyText("eps", String(Math.floor(validDt.getTime() / 1000)))
                    }
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>{copiedKey === "eps" ? "Tersalin!" : "Salin"}</span>
                  </Button>
                </div>
                <p className="font-mono text-[var(--text-secondary)]">
                  Milidetik: {validDt.getTime()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #85 COLOR CONVERTER & WCAG CONTRAST CHECKER
  // =========================================================================
  if (tool.id === "color-contrast-converter") {
    const fgRgb = hexToRgbTuple(fgColor) ?? { r: 15, g: 23, b: 42 };
    const bgRgb = hexToRgbTuple(bgColor) ?? { r: 236, g: 253, b: 245 };
    const lum1 = relativeLuminance(fgRgb.r, fgRgb.g, fgRgb.b);
    const lum2 = relativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
    const contrastRatio = (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <label htmlFor={`${formId}-cfg`} className="block text-xs font-semibold text-[var(--text-primary)]">
              Warna Teks (Foreground)
            </label>
            <div className="flex gap-2">
              <Input
                type="color"
                aria-label="Picker warna teks"
                value={hexToRgbTuple(fgColor) ? fgColor : "#0F172A"}
                onChange={(e) => setFgColor(e.target.value.toUpperCase())}
                className="h-10 w-16 p-1"
              />
              <Input
                id={`${formId}-cfg`}
                value={fgColor}
                onChange={(e) => setFgColor(e.target.value)}
                className="font-mono uppercase"
              />
            </div>
            <p className="font-mono text-xs text-[var(--text-secondary)]">
              rgb({fgRgb.r}, {fgRgb.g}, {fgRgb.b}) • {rgbToHslString(fgRgb.r, fgRgb.g, fgRgb.b)}
            </p>
          </div>

          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <label htmlFor={`${formId}-cbg`} className="block text-xs font-semibold text-[var(--text-primary)]">
              Warna Latar (Background)
            </label>
            <div className="flex gap-2">
              <Input
                type="color"
                aria-label="Picker warna latar"
                value={hexToRgbTuple(bgColor) ? bgColor : "#ECFDF5"}
                onChange={(e) => setBgColor(e.target.value.toUpperCase())}
                className="h-10 w-16 p-1"
              />
              <Input
                id={`${formId}-cbg`}
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="font-mono uppercase"
              />
            </div>
            <p className="font-mono text-xs text-[var(--text-secondary)]">
              rgb({bgRgb.r}, {bgRgb.g}, {bgRgb.b}) • {rgbToHslString(bgRgb.r, bgRgb.g, bgRgb.b)}
            </p>
          </div>
        </div>

        <div
          className="rounded-xl border border-[var(--border-subtle)] p-6 text-center transition-colors"
          style={{ backgroundColor: bgColor, color: fgColor }}
        >
          <p className="text-lg font-bold">Pratinjau Keterbacaan Teks RuangKerja</p>
          <p className="mt-1 text-xs opacity-90">
            Rasio Kontras WCAG 2.1: <strong>{contrastRatio.toFixed(2)} : 1</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={contrastRatio >= 4.5 ? "success" : "warning"}>
            AA Normal (≥ 4.5): {contrastRatio >= 4.5 ? "LULUS" : "GAGAL"}
          </Badge>
          <Badge variant={contrastRatio >= 3.0 ? "success" : "warning"}>
            AA Teks Besar (≥ 3.0): {contrastRatio >= 3.0 ? "LULUS" : "GAGAL"}
          </Badge>
          <Badge variant={contrastRatio >= 7.0 ? "success" : "outline"}>
            AAA Ketat (≥ 7.0): {contrastRatio >= 7.0 ? "LULUS" : "BELUM"}
          </Badge>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #86 SQL FORMATTER
  // =========================================================================
  if (tool.id === "sql-formatter") {
    const formattedSql = formatSqlQuery(sqlIn);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-sqlin`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Query SQL Mentah
            </label>
            <textarea
              id={`${formId}-sqlin`}
              rows={10}
              value={sqlIn}
              onChange={(e) => setSqlIn(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                SQL Terformat
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!formattedSql}
                onClick={() => void copyText("sql", formattedSql)}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copiedKey === "sql" ? "Tersalin!" : "Salin SQL"}</span>
              </Button>
            </div>
            <pre className="mt-1 h-[226px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3 font-mono text-xs text-[var(--text-primary)]">
              {formattedSql || "—"}
            </pre>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setSqlIn("")}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Reset</span>
        </Button>
      </div>
    );
  }

  // =========================================================================
  // #87 HTML / XML FORMATTER & ESCAPE
  // =========================================================================
  if (tool.id === "html-xml-formatter") {
    const htmlOut =
      htmlMode === "beautify"
        ? formatHtmlXml(htmlIn, 2)
        : htmlMode === "minify"
          ? htmlIn.trim().replace(/>\s+</g, "><").replace(/\s{2,}/g, " ")
          : htmlMode === "escape"
            ? escapeHtmlEntities(htmlIn)
            : unescapeHtmlEntities(htmlIn);

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["beautify", "Rapikan (Beautify)"],
              ["minify", "Minify"],
              ["escape", "Escape Entities (&lt;)"],
              ["unescape", "Unescape (<)"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setHtmlMode(m)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium",
                htmlMode === m
                  ? "border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-htmlin`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Input HTML / XML
            </label>
            <textarea
              id={`${formId}-htmlin`}
              rows={9}
              value={htmlIn}
              onChange={(e) => setHtmlIn(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Output</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!htmlOut}
                onClick={() => void copyText("html", htmlOut)}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copiedKey === "html" ? "Tersalin!" : "Salin"}</span>
              </Button>
            </div>
            <pre className="mt-1 h-[206px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3 font-mono text-xs text-[var(--text-primary)]">
              {htmlOut || "—"}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #88 CSS BOX SHADOW & BORDER RADIUS STUDIO
  // =========================================================================
  if (tool.id === "css-shadow-radius-studio") {
    const rgb = hexToRgbTuple(cssShadowHex) ?? { r: 13, g: 122, b: 104 };
    const shadowRule = `${cssInset ? "inset " : ""}${cssX}px ${cssY}px ${cssBlur}px ${cssSpread}px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${cssOpacity})`;
    const cssSnippet = `box-shadow: ${shadowRule};\nborder-radius: ${cssRadius}px;`;

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <div>
              <label htmlFor={`${formId}-cx`} className="text-xs font-medium">
                Offset X ({cssX}px)
              </label>
              <Input
                id={`${formId}-cx`}
                type="range"
                min="-50"
                max="50"
                value={cssX}
                onChange={(e) => setCssX(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-cy`} className="text-xs font-medium">
                Offset Y ({cssY}px)
              </label>
              <Input
                id={`${formId}-cy`}
                type="range"
                min="-50"
                max="50"
                value={cssY}
                onChange={(e) => setCssY(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-cb`} className="text-xs font-medium">
                Blur ({cssBlur}px)
              </label>
              <Input
                id={`${formId}-cb`}
                type="range"
                min="0"
                max="100"
                value={cssBlur}
                onChange={(e) => setCssBlur(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-cs`} className="text-xs font-medium">
                Spread ({cssSpread}px)
              </label>
              <Input
                id={`${formId}-cs`}
                type="range"
                min="-30"
                max="40"
                value={cssSpread}
                onChange={(e) => setCssSpread(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-cr`} className="text-xs font-medium">
                Border Radius ({cssRadius}px)
              </label>
              <Input
                id={`${formId}-cr`}
                type="range"
                min="0"
                max="64"
                value={cssRadius}
                onChange={(e) => setCssRadius(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-co`} className="text-xs font-medium">
                Opasitas ({Math.round(cssOpacity * 100)}%)
              </label>
              <Input
                id={`${formId}-co`}
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={cssOpacity}
                onChange={(e) => setCssOpacity(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor={`${formId}-cc`} className="block text-xs font-medium">
                Warna Shadow
              </label>
              <Input
                id={`${formId}-cc`}
                type="color"
                value={cssShadowHex}
                onChange={(e) => setCssShadowHex(e.target.value)}
                className="mt-1 h-9 p-1"
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={cssInset}
                onChange={(e) => setCssInset(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span>Bayangan Dalam (inset)</span>
            </label>
          </div>

          <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 p-8">
            <div
              className="flex h-36 w-52 items-center justify-center border border-[var(--border-subtle)] bg-[var(--surface-card)] text-xs font-semibold text-[var(--text-primary)]"
              style={{
                boxShadow: shadowRule,
                borderRadius: `${cssRadius}px`,
              }}
            >
              Pratinjau Komponen
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3">
          <pre className="font-mono text-xs text-[var(--text-primary)]">{cssSnippet}</pre>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void copyText("css", cssSnippet)}
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copiedKey === "css" ? "Tersalin!" : "Salin CSS"}</span>
          </Button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // #89 YAML <-> JSON CONVERTER (FastAPI PyYAML Backend)
  // =========================================================================
  if (tool.id === "yaml-json-converter") {
    async function handleConvertYaml() {
      if (!yamlIn.trim()) return;
      setYamlLoading(true);
      setYamlError(null);
      try {
        const res = await convertYamlJson(yamlIn, yamlDir, yamlIndent);
        setYamlOut(res.output);
      } catch (err) {
        setYamlError(err instanceof Error ? err.message : "Konversi gagal.");
      } finally {
        setYamlLoading(false);
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["yaml_to_json", "YAML → JSON"],
                ["json_to_yaml", "JSON → YAML"],
              ] as const
            ).map(([d, lbl]) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setYamlDir(d);
                  setYamlIn(d === "yaml_to_json" ? SAMPLE_YAML_DEV : SAMPLE_JSON_DEV);
                  setYamlOut("");
                  setYamlError(null);
                }}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium",
                  yamlDir === d
                    ? "border-[var(--brand-primary)] bg-[var(--brand-soft)] text-[var(--brand-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-secondary)]"
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Spasi indentasi"
              value={yamlIndent}
              onChange={(e) => setYamlIndent(Number(e.target.value))}
              className="h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 text-xs"
            >
              <option value={2}>Indent 2 Spasi</option>
              <option value={4}>Indent 4 Spasi</option>
            </select>
            <Button type="button" disabled={yamlLoading} onClick={() => void handleConvertYaml()}>
              {yamlLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              <span>Konversi via FastAPI</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label htmlFor={`${formId}-yin`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Input ({yamlDir === "yaml_to_json" ? "YAML" : "JSON"})
            </label>
            <textarea
              id={`${formId}-yin`}
              rows={11}
              value={yamlIn}
              onChange={(e) => setYamlIn(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs text-[var(--text-primary)]"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                Output ({yamlDir === "yaml_to_json" ? "JSON" : "YAML"})
              </span>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!yamlOut}
                  onClick={() => void copyText("yaml", yamlOut)}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{copiedKey === "yaml" ? "Tersalin!" : "Salin"}</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!yamlOut}
                  onClick={() =>
                    downloadTextArtifact(
                      yamlDir === "yaml_to_json" ? "converted.json" : "converted.yaml",
                      yamlOut
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Unduh</span>
                </Button>
              </div>
            </div>
            <pre className="mt-1 h-[248px] overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3 font-mono text-xs text-[var(--text-primary)]">
              {yamlOut || "Klik Konversi untuk memproses di backend FastAPI."}
            </pre>
          </div>
        </div>

        {yamlError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {yamlError}
          </p>
        )}
      </div>
    );
  }

  // =========================================================================
  // #90 CRON EXPRESSION PARSER
  // =========================================================================
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${formId}-cron`} className="block text-xs font-medium text-[var(--text-secondary)]">
          Ekspresi Cron 5 Field (menit jam tanggal bulan hari-minggu)
        </label>
        <Input
          id={`${formId}-cron`}
          value={cronExpr}
          onChange={(e) => setCronExpr(e.target.value)}
          className="mt-1 font-mono text-base"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs text-[var(--text-muted)]">Preset Umum:</span>
        {[
          { label: "Tiap 5 Menit", expr: "*/5 * * * *" },
          { label: "Jam Kerja (Senin–Jumat 09:00)", expr: "0 9 * * 1-5" },
          { label: "Harian Tengah Malam", expr: "0 0 * * *" },
          { label: "Awal Bulan 08:30", expr: "30 8 1 * *" },
        ].map((p) => (
          <button
            key={p.expr}
            type="button"
            onClick={() => setCronExpr(p.expr)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
          >
            {p.label}
          </button>
        ))}
      </div>

      {cronComputed.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {cronComputed.error}
        </p>
      )}

      {cronComputed.data && (
        <div className="space-y-3">
          <div className="rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-soft)]/50 p-4">
            <p className="text-xs font-medium text-[var(--brand-primary)]">Arti Jadwal</p>
            <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">
              {cronComputed.data.description}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">
              6 Eksekusi Mendatang (Waktu Lokal)
            </p>
            <ol className="space-y-1.5 text-xs font-mono">
              {cronComputed.data.upcoming.map((ts, idx) => (
                <li
                  key={idx}
                  className="rounded-lg bg-[var(--surface-muted)]/60 px-3 py-1.5 text-[var(--text-primary)]"
                >
                  {idx + 1}. {ts}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
