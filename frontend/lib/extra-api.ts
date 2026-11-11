import { ApiClientError, getApiBaseUrl } from "@/lib/api-client";
import { parseContentDispositionFilename } from "@/lib/file-job-client";
import type { PaperSizeOption, PdfJobResult } from "@/types/pdf";

export interface PdfTextExtractResult {
  filename: string;
  page_count: number;
  total_chars: number;
  pages: { page_number: number; text: string }[];
  full_text: string;
}

export interface PdfMetadataResult {
  filename: string;
  page_count: number;
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
}

export interface PaletteColorResult {
  filename: string;
  colors: { hex: string; r: number; g: number; b: number; percent: number }[];
}

export interface SpreadsheetSummaryResult {
  filename: string;
  sheet_name: string;
  row_count: number;
  col_count: number;
  columns: {
    column_name: string;
    total_rows: number;
    non_empty_count: number;
    empty_count: number;
    unique_count: number;
    numeric_count: number;
    min_value: number | null;
    max_value: number | null;
    sum_value: number | null;
    mean_value: number | null;
    top_value: string | null;
  }[];
}

export interface FileHashResult {
  filename: string;
  file_size_bytes: number;
  md5: string;
  sha1: string;
  sha256: string;
  sha512: string;
  expected_match: boolean | null;
}

async function postFormJson<T>(endpoint: string, formData: FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new ApiClientError(
      "Tidak dapat terhubung ke server FastAPI. Pastikan backend berjalan di port 8000.",
      0,
      "NETWORK_ERROR"
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiClientError(
      payload?.error?.message || `Permintaan gagal (HTTP ${response.status}).`,
      response.status,
      payload?.error?.code || "API_ERROR"
    );
  }
  return payload as T;
}

async function postJson<T>(endpoint: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(
      "Tidak dapat terhubung ke server FastAPI. Pastikan backend berjalan di port 8000.",
      0,
      "NETWORK_ERROR"
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiClientError(
      payload?.error?.message || `Permintaan gagal (HTTP ${response.status}).`,
      response.status,
      payload?.error?.code || "API_ERROR"
    );
  }
  return payload as T;
}

async function postJsonBinaryJob(endpoint: string, body: unknown, fallbackName: string): Promise<PdfJobResult> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(
      "Tidak dapat terhubung ke server FastAPI. Pastikan backend berjalan di port 8000.",
      0,
      "NETWORK_ERROR"
    );
  }
  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    throw new ApiClientError(
      errJson?.error?.message || `Permintaan gagal (HTTP ${response.status}).`,
      response.status,
      errJson?.error?.code || "API_ERROR"
    );
  }
  const blob = await response.blob();
  const mimeType =
    response.headers.get("content-type")?.split(";")[0].trim() ||
    blob.type ||
    "application/octet-stream";
  const filename = parseContentDispositionFilename(
    response.headers.get("content-disposition"),
    fallbackName
  );
  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    filename,
    mimeType,
    sizeBytes: blob.size,
    pageCount: null,
    outputCount: null,
    originalSize: null,
    processedSize: null,
    ocrPreview: null,
    extractedFiles: [],
  };
}

export async function extractPdfText(
  file: File,
  pages?: string,
  password?: string
): Promise<PdfTextExtractResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (pages?.trim()) fd.append("pages", pages.trim());
  if (password?.trim()) fd.append("password", password.trim());
  return postFormJson<PdfTextExtractResult>("/api/pdf/extract-text", fd);
}

export async function readPdfMetadata(
  file: File,
  password?: string
): Promise<PdfMetadataResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (password?.trim()) fd.append("password", password.trim());
  return postFormJson<PdfMetadataResult>("/api/pdf/metadata/read", fd);
}

export async function markdownToPdfJob(params: {
  markdown_text: string;
  document_title: string;
  paper_size: PaperSizeOption;
  margin_mm: number;
  font_size: number;
}): Promise<PdfJobResult> {
  return postJsonBinaryJob("/api/pdf/markdown-to-pdf", params, "dokumen-markdown.pdf");
}

export async function fetchColorPalette(
  file: File,
  colorCount: number = 6
): Promise<PaletteColorResult> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("color_count", String(colorCount));
  return postFormJson<PaletteColorResult>("/api/images/palette", fd);
}

export async function spreadsheetToJson(
  file: File,
  sheetName?: string,
  pretty: boolean = true
): Promise<{ filename: string; sheet_name: string; row_count: number; json_text: string }> {
  const fd = new FormData();
  fd.append("file", file);
  if (sheetName) fd.append("sheet_name", sheetName);
  fd.append("pretty", String(pretty));
  return postFormJson("/api/spreadsheets/to-json", fd);
}

export async function fetchSpreadsheetSummary(
  file: File,
  sheetName?: string
): Promise<SpreadsheetSummaryResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (sheetName) fd.append("sheet_name", sheetName);
  return postFormJson<SpreadsheetSummaryResult>("/api/spreadsheets/summary", fd);
}

export async function generateInvoicePdfJob(payload: {
  document_type: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  sender_name: string;
  sender_details: string;
  client_name: string;
  client_details: string;
  currency: string;
  items: { description: string; quantity: number; unit_price: number }[];
  discount_percent: number;
  tax_percent: number;
  notes: string;
  accent_color: string;
}): Promise<PdfJobResult> {
  return postJsonBinaryJob("/api/utility/invoice-pdf", payload, "invoice.pdf");
}

export async function generateBarcodeJob(payload: {
  value: string;
  barcode_type: "code128" | "ean13" | "ean8";
  output_format: "svg" | "png";
  scale: number;
  height_px: number;
  show_text: boolean;
  fill_color: string;
  back_color: string;
}): Promise<PdfJobResult> {
  return postJsonBinaryJob(
    "/api/utility/barcode",
    payload,
    payload.output_format === "svg" ? "barcode.svg" : "barcode.png"
  );
}

export async function convertYamlJson(
  content: string,
  direction: "json_to_yaml" | "yaml_to_json",
  indent: number = 2
): Promise<{ output: string; direction: string }> {
  return postJson("/api/utility/yaml-json", { content, direction, indent });
}

export async function hashFileChecksum(
  file: File,
  expectedHash?: string
): Promise<FileHashResult> {
  const fd = new FormData();
  fd.append("file", file);
  if (expectedHash?.trim()) fd.append("expected_hash", expectedHash.trim());
  return postFormJson<FileHashResult>("/api/utility/hash-file", fd);
}

