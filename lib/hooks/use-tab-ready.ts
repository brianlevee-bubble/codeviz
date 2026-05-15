'use client';

import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import type { AnalysisId } from '@/lib/analyze-all';

/**
 * Returns true once the tab's background analysis cache is written.
 * If already cached on mount, resolves immediately.
 * If the background analysis is running, polls until done.
 */
export function useTabReady(analysisId: AnalysisId, cacheKey: string): boolean {
  const tabProgress = useGraphStore(s => s.tabProgress);
  const [ready, setReady] = useState(() => {
    try { return !!localStorage.getItem(cacheKey); } catch { return false; }
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (ready) return;
    const status = tabProgress[analysisId];
    if (status === 'done') {
      setReady(true);
      return;
    }
    // Poll localStorage until cache appears (background analysis writes it)
    pollRef.current = setInterval(() => {
      try {
        if (localStorage.getItem(cacheKey)) {
          setReady(true);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [ready, analysisId, cacheKey, tabProgress]);

  return ready;
}
