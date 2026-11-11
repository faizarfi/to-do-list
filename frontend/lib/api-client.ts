import type { BackendHealthResponse, CapabilitiesResponse } from "@/types/tools";

const DEFAULT_API_BASE = "http://localhost:8000";

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
}

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(message: string, status: number = 500, code: string = "API_ERROR") {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiClientError(
      "Tidak dapat terhubung ke server FastAPI. Pastikan backend berjalan di port 8000.",
      0,
      "NETWORK_ERROR"
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Permintaan gagal dengan status HTTP ${response.status}.`;
    const code = payload?.error?.code || "HTTP_ERROR";
    throw new ApiClientError(message, response.status, code);
  }

  return payload as T;
}

export async function fetchBackendHealth(): Promise<BackendHealthResponse> {
  return requestJson<BackendHealthResponse>("/api/health");
}

export async function fetchBackendCapabilities(): Promise<CapabilitiesResponse> {
  return requestJson<CapabilitiesResponse>("/api/health/capabilities");
}

