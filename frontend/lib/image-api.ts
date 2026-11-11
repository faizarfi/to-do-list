import { ApiClientError, getApiBaseUrl } from "@/lib/api-client";
import type { ImageInfoResponse } from "@/types/image";

export async function fetchImagesInfo(files: File[]): Promise<ImageInfoResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/images/info`, {
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
      payload?.error?.message || "Gagal membaca informasi gambar.",
      response.status,
      payload?.error?.code || "IMAGE_INFO_ERROR"
    );
  }

  return payload as ImageInfoResponse;
}

