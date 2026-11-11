import { ApiClientError, getApiBaseUrl } from "@/lib/api-client";
import {
  formatBytes,
  parseContentDispositionFilename,
  revokeJobResult,
  submitBinaryFileJob,
} from "@/lib/file-job-client";
import type { PdfInspectResponse } from "@/types/pdf";

export {
  formatBytes,
  parseContentDispositionFilename,
  revokeJobResult as revokePdfJobResult,
  submitBinaryFileJob as submitPdfJob,
};

export async function inspectPdfFile(
  file: File,
  password?: string
): Promise<PdfInspectResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (password) {
    formData.append("password", password);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/pdf/inspect`, {
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
      payload?.error?.message || "Gagal memeriksa isi dokumen PDF.",
      response.status,
      payload?.error?.code || "INSPECT_ERROR"
    );
  }

  return payload as PdfInspectResponse;
}
