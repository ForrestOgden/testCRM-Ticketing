"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../components/AuthProvider";

export function useApiResource<T>(path: string, enabled = true) {
  const { request } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await request<T>(path);
      setData(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, [enabled, path, request]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { data, loading, error, refresh, setData };
}
