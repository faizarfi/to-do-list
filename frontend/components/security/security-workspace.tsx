"use client";

import { useId, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

import {
  FileDropzone,
  type SelectedFileItem,
} from "@/components/shared/file-dropzone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  evaluatePasswordStrength,
  generateSecurePassword,
  maskSensitiveText,
} from "@/lib/dev-tools";
import { hashFileChecksum, type FileHashResult } from "@/lib/extra-api";
import { formatBytes } from "@/lib/pdf-api";
import type { ToolDefinition } from "@/types/tools";

const NANOID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

function generateNanoId(length: number): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += NANOID_ALPHABET[bytes[i] % NANOID_ALPHABET.length];
  }
  return out;
}

function generateUlidLike(): string {
  const encoding = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let timeNow = Date.now();
  let timeChars = "";
  for (let i = 0; i < 10; i += 1) {
    timeChars = encoding[timeNow % 32] + timeChars;
    timeNow = Math.floor(timeNow / 32);
  }
  const randBytes = new Uint32Array(16);
  crypto.getRandomValues(randBytes);
  let randChars = "";
  for (let i = 0; i < 16; i += 1) {
    randChars += encoding[randBytes[i] % 32];
  }
  return timeChars + randChars;
}

export function SecurityWorkspace({ tool }: { tool: ToolDefinition }) {
  const formId = useId();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // #91 Password Generator & Strength Checker
  const [pwLength, setPwLength] = useState(16);
  const [pwUpper, setPwUpper] = useState(true);
  const [pwLower, setPwLower] = useState(true);
  const [pwDigits, setPwDigits] = useState(true);
  const [pwSymbols, setPwSymbols] = useState(true);
  const [generatedPw, setGeneratedPw] = useState(() =>
    generateSecurePassword({
      length: 16,
      upper: true,
      lower: true,
      digits: true,
      symbols: true,
    })
  );
  const [checkPwInput, setCheckPwInput] = useState("RuangKerja!2026");

  // #92 Hash File Checksum (FastAPI)
  const [hashFiles, setHashFiles] = useState<SelectedFileItem[]>([]);
  const [expectedHash, setExpectedHash] = useState("");
  const [hashLoading, setHashLoading] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);
  const [hashResult, setHashResult] = useState<FileHashResult | null>(null);

  // #93 UUID & NanoID Generator
  const [idType, setIdType] = useState<"uuid" | "nanoid" | "ulid">("uuid");
  const [idCount, setIdCount] = useState(5);
  const [nanoLen, setNanoLen] = useState(21);
  const [generatedIds, setGeneratedIds] = useState<string[]>(() =>
    Array.from({ length: 5 }, () => crypto.randomUUID())
  );

  // #94 HMAC Signature Generator
  const [hmacAlgo, setHmacAlgo] = useState<"SHA-256" | "SHA-512" | "SHA-1">("SHA-256");
  const [hmacFormat, setHmacFormat] = useState<"hex" | "base64">("hex");
  const [hmacSecret, setHmacSecret] = useState("kunci-rahasia-webhook");
  const [hmacMessage, setHmacMessage] = useState('{"event":"invoice.paid","id":"INV-001"}');
  const [hmacOutput, setHmacOutput] = useState("");
  const [hmacError, setHmacError] = useState<string | null>(null);

  // #95 Data Masking & Anonymizer
  const [maskIn, setMaskIn] = useState(
    "Pelanggan Budi Santoso (budi.santoso@contoh.id, HP 0812-3456-7890) mendaftar dengan NIK 3201011234560001."
  );
  const [maskEmails, setMaskEmails] = useState(true);
  const [maskPhones, setMaskPhones] = useState(true);
  const [maskNumbers, setMaskNumbers] = useState(true);

  async function copyVal(key: string, text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard failures
    }
  }

  const strengthCheck = useMemo(() => evaluatePasswordStrength(checkPwInput), [checkPwInput]);
  const maskedResult = useMemo(
    () =>
      maskSensitiveText(maskIn, {
        maskEmails,
        maskPhones,
        maskNumbers,
      }),
    [maskIn, maskEmails, maskPhones, maskNumbers]
  );

  // =========================================================================
  // #91 PASSWORD GENERATOR & STRENGTH CHECKER
  // =========================================================================
  if (tool.id === "password-generator-checker") {
    function regeneratePw() {
      setGeneratedPw(
        generateSecurePassword({
          length: pwLength,
          upper: pwUpper,
          lower: pwLower,
          digits: pwDigits,
          symbols: pwSymbols,
        })
      );
    }

    const genStrength = evaluatePasswordStrength(generatedPw);

    return (
      <div className="space-y-5">
        <div className="space-y-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Generator Kata Sandi Kriptografis
            </span>
            <Badge variant="success">
              {genStrength.label} (~{genStrength.entropyBits} bit entropi)
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3">
            <span className="min-w-0 flex-1 break-all font-mono text-base font-bold text-[var(--text-primary)]">
              {generatedPw}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={regeneratePw}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Buat Ulang</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void copyVal("pwgen", generatedPw)}
            >
              {copiedKey === "pwgen" ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{copiedKey === "pwgen" ? "Tersalin!" : "Salin"}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${formId}-pwlen`} className="text-xs font-medium text-[var(--text-secondary)]">
                Panjang Karakter: {pwLength}
              </label>
              <Input
                id={`${formId}-pwlen`}
                type="range"
                min="6"
                max="64"
                value={pwLength}
                onChange={(e) => {
                  const len = Number(e.target.value);
                  setPwLength(len);
                  setGeneratedPw(
                    generateSecurePassword({
                      length: len,
                      upper: pwUpper,
                      lower: pwLower,
                      digits: pwDigits,
                      symbols: pwSymbols,
                    })
                  );
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pwUpper}
                  onChange={(e) => setPwUpper(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>Huruf Besar (A–Z)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pwLower}
                  onChange={(e) => setPwLower(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>Huruf Kecil (a–z)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pwDigits}
                  onChange={(e) => setPwDigits(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>Angka (2–9)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pwSymbols}
                  onChange={(e) => setPwSymbols(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span>Simbol (!@#$)</span>
              </label>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={`${formId}-pwchk`} className="text-xs font-semibold text-[var(--text-primary)]">
              Uji Kekuatan Kata Sandi Sendiri
            </label>
            <Badge variant={strengthCheck.entropyBits >= 55 ? "success" : "warning"}>
              {strengthCheck.label} ({strengthCheck.entropyBits} bit)
            </Badge>
          </div>
          <Input
            id={`${formId}-pwchk`}
            type="text"
            value={checkPwInput}
            onChange={(e) => setCheckPwInput(e.target.value)}
            placeholder="Ketik kata sandi untuk diuji entropinya..."
            className="font-mono"
          />
        </div>
      </div>
    );
  }

  // =========================================================================
  // #92 HASH FILE & CHECKSUM VERIFIER (FastAPI)
  // =========================================================================
  if (tool.id === "hash-file-checksum") {
    async function handleComputeHash(e: React.FormEvent) {
      e.preventDefault();
      if (hashFiles.length === 0) {
        setHashError("Pilih minimal 1 file untuk dihitung checksum-nya.");
        return;
      }
      setHashLoading(true);
      setHashError(null);
      try {
        const res = await hashFileChecksum(hashFiles[0].file, expectedHash);
        setHashResult(res);
      } catch (err) {
        setHashError(err instanceof Error ? err.message : "Gagal menghitung hash file.");
      } finally {
        setHashLoading(false);
      }
    }

    return (
      <form onSubmit={(e) => void handleComputeHash(e)} className="space-y-4">
        <FileDropzone
          label="Pilih atau Seret File Apa Saja untuk Dihitung Checksum"
          acceptAttr="*/*"
          allowedExtensions={[]}
          multiple={false}
          files={hashFiles}
          onFilesChange={(next) => {
            setHashFiles(next);
            setHashResult(null);
            setHashError(null);
          }}
          helperText="File dihitung di FastAPI secara streaming (MD5, SHA-1, SHA-256, SHA-512) lalu langsung dibersihkan."
        />

        <div>
          <label htmlFor={`${formId}-exphash`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Verifikasi dengan Expected Hash (Opsional — tempel nilai hash pembanding)
          </label>
          <Input
            id={`${formId}-exphash`}
            value={expectedHash}
            onChange={(e) => setExpectedHash(e.target.value)}
            placeholder="Tempel hash SHA-256 / MD5 resmi untuk dicocokkan otomatis..."
            className="mt-1 font-mono"
          />
        </div>

        {hashError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {hashError}
          </p>
        )}

        <Button type="submit" disabled={hashLoading || hashFiles.length === 0}>
          {hashLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          )}
          <span>Hitung Checksum File</span>
        </Button>

        {hashResult && (
          <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-semibold text-[var(--text-primary)]">{hashResult.filename}</span>
                <span className="ml-2 text-[var(--text-muted)]">
                  ({formatBytes(hashResult.file_size_bytes)})
                </span>
              </div>
              {hashResult.expected_match !== null && (
                <Badge variant={hashResult.expected_match ? "success" : "warning"}>
                  {hashResult.expected_match
                    ? "COCOK dengan Expected Hash!"
                    : "TIDAK COCOK dengan Expected Hash!"}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              {(
                [
                  ["MD5", hashResult.md5],
                  ["SHA-1", hashResult.sha1],
                  ["SHA-256", hashResult.sha256],
                  ["SHA-512", hashResult.sha512],
                ] as const
              ).map(([algo, digest]) => (
                <div
                  key={algo}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-muted)]/60 p-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-[var(--text-muted)]">{algo}</p>
                    <p className="break-all font-mono text-xs text-[var(--text-primary)]">
                      {digest}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyVal(algo, digest)}
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>{copiedKey === algo ? "Tersalin!" : "Salin"}</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    );
  }

  // =========================================================================
  // #93 UUID & NANOID BATCH GENERATOR
  // =========================================================================
  if (tool.id === "uuid-nanoid-generator") {
    function generateBatchIds() {
      const count = Math.max(1, Math.min(50, idCount));
      const next: string[] = [];
      for (let i = 0; i < count; i += 1) {
        if (idType === "uuid") next.push(crypto.randomUUID());
        else if (idType === "nanoid") next.push(generateNanoId(Math.max(8, Math.min(64, nanoLen))));
        else next.push(generateUlidLike());
      }
      setGeneratedIds(next);
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${formId}-idtype`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Jenis Identifier
            </label>
            <select
              id={`${formId}-idtype`}
              value={idType}
              onChange={(e) => setIdType(e.target.value as "uuid" | "nanoid" | "ulid")}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm"
            >
              <option value="uuid">UUID v4 (Standar RFC 4122)</option>
              <option value="nanoid">NanoID (Ringkas URL-Safe)</option>
              <option value="ulid">ULID (Terurut Waktu)</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-idcnt`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Jumlah ID (1–50)
            </label>
            <Input
              id={`${formId}-idcnt`}
              type="number"
              min="1"
              max="50"
              value={idCount}
              onChange={(e) => setIdCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
              className="mt-1"
            />
          </div>
          {idType === "nanoid" && (
            <div>
              <label htmlFor={`${formId}-nlen`} className="block text-xs font-medium text-[var(--text-secondary)]">
                Panjang NanoID (8–64)
              </label>
              <Input
                id={`${formId}-nlen`}
                type="number"
                min="8"
                max="64"
                value={nanoLen}
                onChange={(e) => setNanoLen(Math.max(8, Math.min(64, Number(e.target.value) || 21)))}
                className="mt-1"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={generateBatchIds}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>Buat ID Baru</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void copyVal("ids", generatedIds.join("\n"))}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            <span>{copiedKey === "ids" ? "Semua Tersalin!" : "Salin Semua"}</span>
          </Button>
        </div>

        <ul className="space-y-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs">
          {generatedIds.map((idVal, idx) => (
            <li
              key={`${idVal}-${idx}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-[var(--surface-muted)]/50 px-3 py-1.5"
            >
              <span className="break-all text-[var(--text-primary)]">{idVal}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copyVal(`id-${idx}`, idVal)}
              >
                {copiedKey === `id-${idx}` ? "✓" : "Salin"}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // =========================================================================
  // #94 HMAC SIGNATURE GENERATOR (Web Crypto SubtleCrypto)
  // =========================================================================
  if (tool.id === "hmac-signature-generator") {
    async function computeHmac() {
      setHmacError(null);
      if (!hmacSecret) {
        setHmacError("Masukkan secret key terlebih dahulu.");
        return;
      }
      try {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          enc.encode(hmacSecret),
          { name: "HMAC", hash: hmacAlgo },
          false,
          ["sign"]
        );
        const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(hmacMessage));
        const bytes = new Uint8Array(sigBuf);
        if (hmacFormat === "hex") {
          setHmacOutput(
            Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
          );
        } else {
          let bin = "";
          bytes.forEach((b) => {
            bin += String.fromCharCode(b);
          });
          setHmacOutput(btoa(bin));
        }
      } catch (err) {
        setHmacError(
          err instanceof Error ? err.message : "Gagal menghitung signature HMAC."
        );
      }
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor={`${formId}-halgo`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Algoritma Hash
            </label>
            <select
              id={`${formId}-halgo`}
              value={hmacAlgo}
              onChange={(e) => setHmacAlgo(e.target.value as "SHA-256" | "SHA-512" | "SHA-1")}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm"
            >
              <option value="SHA-256">HMAC-SHA256</option>
              <option value="SHA-512">HMAC-SHA512</option>
              <option value="SHA-1">HMAC-SHA1</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-hfmt`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Format Output
            </label>
            <select
              id={`${formId}-hfmt`}
              value={hmacFormat}
              onChange={(e) => setHmacFormat(e.target.value as "hex" | "base64")}
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm"
            >
              <option value="hex">Hexadecimal</option>
              <option value="base64">Base64</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${formId}-hsec`} className="block text-xs font-medium text-[var(--text-secondary)]">
              Secret Key
            </label>
            <Input
              id={`${formId}-hsec`}
              value={hmacSecret}
              onChange={(e) => setHmacSecret(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${formId}-hmsg`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Pesan / Payload Webhook
          </label>
          <textarea
            id={`${formId}-hmsg`}
            rows={4}
            value={hmacMessage}
            onChange={(e) => setHmacMessage(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 font-mono text-xs"
          />
        </div>

        {hmacError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {hmacError}
          </p>
        )}

        <Button type="button" onClick={() => void computeHmac()}>
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          <span>Hitung Signature HMAC</span>
        </Button>

        {hmacOutput && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 p-3">
            <span className="break-all font-mono text-xs text-[var(--text-primary)]">
              {hmacOutput}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyVal("hmac", hmacOutput)}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{copiedKey === "hmac" ? "Tersalin!" : "Salin"}</span>
            </Button>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // #95 DATA MASKING & ANONYMIZER
  // =========================================================================
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={maskEmails}
              onChange={(e) => setMaskEmails(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span>Samarkan Email</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={maskPhones}
              onChange={(e) => setMaskPhones(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span>Samarkan Nomor HP</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={maskNumbers}
              onChange={(e) => setMaskNumbers(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            <span>Samarkan NIK / Kartu (10–19 digit)</span>
          </label>
        </div>
        <Badge variant="success">{maskedResult.maskedCount} Data Sensitif Disamarkan</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label htmlFor={`${formId}-mskin`} className="block text-xs font-medium text-[var(--text-secondary)]">
            Teks Asli (Log, Chat, atau Catatan)
          </label>
          <textarea
            id={`${formId}-mskin`}
            rows={7}
            value={maskIn}
            onChange={(e) => setMaskIn(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 text-xs"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--text-secondary)]">
              Hasil Aman Dibagikan
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyVal("mask", maskedResult.output)}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{copiedKey === "mask" ? "Tersalin!" : "Salin"}</span>
            </Button>
          </div>
          <pre className="mt-1 h-[156px] overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3 text-xs text-[var(--text-primary)]">
            {maskedResult.output}
          </pre>
        </div>
      </div>
    </div>
  );
}
