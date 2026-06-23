import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { apiUrl } from '../api';
import type { SystemInfo } from '../types';

const FALLBACK: SystemInfo = {
  cuda_available: false,
  default_device: 'cpu',
  ollama: { available: false, models: [], base_url: 'http://localhost:11434' },
};

/** Polls the backend for local capabilities (GPU + Ollama status). */
export function useSystemInfo() {
  const [info, setInfo] = useState<SystemInfo>(FALLBACK);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(apiUrl('/api/system'));
      setInfo(res.data);
    } catch {
      setInfo(FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { info, loading, refresh };
}
