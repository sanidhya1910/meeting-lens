import { useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { apiUrl } from '../api';

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'failed']);

export function useBatchPoll<T>(pollPath: (batchId: string) => string) {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(
    (
      batchId: string,
      onUpdate: (batch: T) => void,
      onTerminal?: (batch: T) => void,
    ) => {
      stopPolling();
      const tick = async () => {
        try {
          const res = await axios.get(apiUrl(pollPath(batchId)));
          const batch: T = res.data.batch;
          onUpdate(batch);
          const status = (batch as { status?: string }).status;
          if (status && TERMINAL_STATUSES.has(status)) {
            stopPolling();
            onTerminal?.(batch);
          }
        } catch {
          stopPolling();
        }
      };
      tick();
      pollRef.current = setInterval(tick, 1500);
    },
    [pollPath, stopPolling],
  );

  return { startPolling, stopPolling };
}
