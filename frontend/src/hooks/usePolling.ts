import { useEffect, useRef } from 'react';

/** Chama `callback` a cada `intervalMs` enquanto `active` for true (status de processamento). */
export function usePolling(callback: () => void | Promise<void>, intervalMs: number, active: boolean): void {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => void saved.current(), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs]);
}
