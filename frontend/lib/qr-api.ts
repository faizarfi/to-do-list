import { ApiClientError, getApiBaseUrl } from "@/lib/api-client";

export type QrContentTypeOption = "text" | "url" | "phone" | "email" | "wifi";
export type QrOutputFormatOption = "png" | "svg";
export type WifiEncryptionOption = "WPA" | "WEP" | "nopass";

export interface QrGeneratePayload {
  content_type: QrContentTypeOption;
  text?: string;
  url?: string;
  phone?: string;
  email_to?: string;
  email_subject?: string;
  email_body?: string;
  wifi_ssid?: string;
  wifi_password?: string;
  wifi_encryption?: WifiEncryptionOption;
  wifi_hidden?: boolean;
  size_px: number;
  border: number;
  fill_color: string;
  back_color: string;
  output_format: QrOutputFormatOption;
}

export interface QrGenerateResult {
  blob: Blob;
  objectUrl: string;
  filename: string;
  mimeType: string;
  payloadText: string;
}

export async function generateQrCode(
  payload: QrGeneratePayload
): Promise<QrGenerateResult> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/api/qr/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ApiClientError(
      "Tidak dapat terhubung ke server FastAPI. Pastikan backend berjalan di port 8000.",
      0,
      "NETWORK_ERROR"
    );
  }

  if (!response.ok) {
    const errPayload = await response.json().catch(() => null);
    throw new ApiClientError(
      errPayload?.error?.message || "Gagal membuat QR Code.",
      response.status,
      errPayload?.error?.code || "QR_ERROR"
    );
  }

  const blob = await response.blob();
  const mimeType = response.headers.get("content-type")?.split(";")[0].trim() || blob.type;
  const ext = payload.output_format === "svg" ? "svg" : "png";
  const encodedPayload = response.headers.get("x-qr-payload-b64");
  let payloadText = "";
  if (encodedPayload) {
    try {
      const bin = atob(encodedPayload);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      payloadText = new TextDecoder("utf-8").decode(bytes);
    } catch {
      payloadText = "";
    }
  }

  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    filename: `qrcode-ruangkerja.${ext}`,
    mimeType,
    payloadText,
  };
}

