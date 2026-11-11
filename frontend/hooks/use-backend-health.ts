"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchBackendCapabilities, fetchBackendHealth } from "@/lib/api-client";
import type { BackendHealthResponse, CapabilitiesResponse } from "@/types/tools";

interface BackendHealthState {
  health: BackendHealthResponse | null;
  capabilities: CapabilitiesResponse | null;
  loading: boolean;
  error: string | null;
  latencyMs: number | null;
  refresh: () => Promise<void>;
}

export function useBackendHealth(autoFetch: boolean = true): BackendHealthState {
  const [health, setHealth] = useState<BackendHealthResponse | null>(null);
  const [capabilities, setCapabilities] = useState<CapabilitiesResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(autoFetch);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const start = performance.now();
    try {
      const [healthData, capabilitiesData] = await Promise.all([
        fetchBackendHealth(),
        fetchBackendCapabilities(),
      ]);
      setHealth(healthData);
      setCapabilities(capabilitiesData);
      setLatencyMs(Math.round(performance.now() - start));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal memeriksa status backend.";
      setError(message);
      setHealth(null);
      setCapabilities(null);
      setLatencyMs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      void refresh();
    }
  }, [autoFetch, refresh]);

  return {
    health,
    capabilities,
    loading,
    error,
    latencyMs,
    refresh,
  };
}

