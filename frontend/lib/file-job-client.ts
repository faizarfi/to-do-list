import JSZip from "jszip";

import { ApiClientError, getApiBaseUrl } from "@/lib/api-client";
import type { ExtractedOutputItem, PdfJobResult } from "@/types/pdf";

export function parseContentDispositionFilename(
  headerValue: string | null,
  fallback: string
): string {
  if (!headerValue) return fallback;

  const utf8Match = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
    } catch {
      // Fallback below
    }
  }

  const asciiMatch = /filename\s*=\s*"?([^";]+)"?/i.exec(headerValue);
  if (asciiMatch?.[1]) {
    return asciiMatch[1].trim();
  }

  return fallback;
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".tif") || lower.endsWith(".tiff")) return "image/tiff";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) {
    return "application/vnd.ms-excel";
  }
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function parseCsvPreviewRows(csvText: string, maxRows: number = 25): string[][] {
  const cleaned = csvText.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const first = lines[0];
  const candidates = [",", ";", "\t", "|"];
  let delimiter = ",";
  let bestCount = 0;
  for (const delim of candidates) {
    const count = first.split(delim).length - 1;
    if (count > bestCount) {
      bestCount = count;
      delimiter = delim;
    }
  }

  const parsedRows: string[][] = [];
  for (const line of lines.slice(0, maxRows)) {
    const row: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        row.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    row.push(current);
    parsedRows.push(row);
  }
  return parsedRows;
}

function decodeBase64Utf8(encoded: string | null): string | null {
  if (!encoded) return null;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

export async function submitBinaryFileJob(
  endpoint: string,
  formData: FormData,
  onProgress?: (percent: number | null) => void
): Promise<PdfJobResult> {
  const url = `${getApiBaseUrl()}${endpoint}`;

  const rawResult = await new Promise<{
    blob: Blob;
    headers: Headers;
    status: number;
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.responseType = "blob";

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (event.lengthComputable && event.total > 0) {
        const uploadPct = Math.round((event.loaded / event.total) * 75);
        onProgress(Math.max(5, Math.min(uploadPct, 75)));
      } else {
        onProgress(null);
      }
    };

    xhr.upload.onload = () => {
      onProgress?.(null);
    };

    xhr.onload = () => {
      const headers = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim();
      if (rawHeaders) {
        for (const line of rawHeaders.split(/[\r\n]+/)) {
          const idx = line.indexOf(":");
          if (idx > 0) {
            headers.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
          }
        }
      }
      resolve({
        blob: xhr.response as Blob,
        headers,
        status: xhr.status,
      });
    };

    xhr.onerror = () => {
      reject(
        new ApiClientError(
          "Koneksi ke backend FastAPI gagal. Pastikan server berjalan di port 8000.",
          0,
          "NETWORK_ERROR"
        )
      );
    };

    xhr.onabort = () => {
      reject(new ApiClientError("Proses dibatalkan.", 0, "ABORTED"));
    };

    onProgress?.(5);
    xhr.send(formData);
  });

  if (rawResult.status >= 400) {
    let errorCode = "PROCESS_ERROR";
    let errorMessage = `Proses gagal (HTTP ${rawResult.status}).`;
    try {
      const text = await rawResult.blob.text();
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) {
        errorMessage = parsed.error.message;
      } else if (Array.isArray(parsed?.detail) && parsed.detail[0]?.msg) {
        errorMessage = String(parsed.detail[0].msg);
      }
      if (parsed?.error?.code) errorCode = parsed.error.code;
    } catch {
      // Keep fallback message
    }
    throw new ApiClientError(errorMessage, rawResult.status, errorCode);
  }

  onProgress?.(92);

  const mimeType =
    rawResult.headers.get("content-type")?.split(";")[0].trim() ||
    rawResult.blob.type ||
    "application/octet-stream";

  const defaultName =
    mimeType === "application/zip"
      ? "hasil-ruangkerja.zip"
      : mimeType === "image/jpeg"
        ? "hasil.jpg"
        : mimeType === "image/png"
          ? "hasil.png"
          : mimeType === "image/webp"
            ? "hasil.webp"
            : mimeType === "image/tiff"
              ? "hasil.tiff"
              : mimeType === "image/svg+xml"
                ? "hasil.svg"
                : mimeType === "text/csv"
                  ? "hasil.csv"
                  : mimeType.includes("spreadsheetml")
                    ? "hasil.xlsx"
                    : mimeType === "application/vnd.ms-excel"
                      ? "hasil.xls"
                      : "hasil.pdf";

  const filename = parseContentDispositionFilename(
    rawResult.headers.get("content-disposition"),
    defaultName
  );

  const objectUrl = URL.createObjectURL(rawResult.blob);
  const extractedFiles: ExtractedOutputItem[] = [];

  if (mimeType === "application/zip") {
    const zip = await JSZip.loadAsync(rawResult.blob);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryBuffer = await entry.async("blob");
      const entryMime = guessMimeFromName(entry.name);
      const typedBlob = new Blob([entryBuffer], { type: entryMime });
      extractedFiles.push({
        name: entry.name,
        sizeBytes: typedBlob.size,
        mimeType: entryMime,
        blob: typedBlob,
        objectUrl: URL.createObjectURL(typedBlob),
      });
    }
  }

  onProgress?.(100);

  const parseIntHeader = (key: string): number | null => {
    const raw = rawResult.headers.get(key);
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  let csvPreviewRows: string[][] | null = null;
  if (mimeType === "text/csv") {
    try {
      const csvText = await rawResult.blob.text();
      csvPreviewRows = parseCsvPreviewRows(csvText, 25);
    } catch {
      csvPreviewRows = null;
    }
  }

  return {
    blob: rawResult.blob,
    objectUrl,
    filename,
    mimeType,
    sizeBytes: rawResult.blob.size,
    pageCount: parseIntHeader("x-result-page-count"),
    outputCount: parseIntHeader("x-output-count"),
    originalSize: parseIntHeader("x-original-size"),
    processedSize: parseIntHeader("x-processed-size"),
    ocrPreview: decodeBase64Utf8(rawResult.headers.get("x-ocr-preview-b64")),
    imageWidth: parseIntHeader("x-image-width"),
    imageHeight: parseIntHeader("x-image-height"),
    originalRowCount: parseIntHeader("x-original-row-count"),
    processedRowCount: parseIntHeader("x-processed-row-count"),
    removedCount: parseIntHeader("x-removed-count"),
    csvPreviewRows,
    extractedFiles,
  };
}

export function revokeJobResult(result: PdfJobResult | null): void {
  if (!result) return;
  URL.revokeObjectURL(result.objectUrl);
  for (const item of result.extractedFiles) {
    URL.revokeObjectURL(item.objectUrl);
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

