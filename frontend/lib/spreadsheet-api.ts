import { ApiClientError, getApiBaseUrl } from "@/lib/api-client";
import type { SpreadsheetViewResponse } from "@/types/spreadsheet";

export async function viewSpreadsheetFile(
  file: File,
  maxRows: number = 500
): Promise<SpreadsheetViewResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("max_rows", String(maxRows));

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/spreadsheets/view`, {
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
      payload?.error?.message || "Gagal membaca isi file spreadsheet.",
      response.status,
      payload?.error?.code || "SPREADSHEET_VIEW_ERROR"
    );
  }

  return payload as SpreadsheetViewResponse;
}

