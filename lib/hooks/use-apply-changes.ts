'use client';

import { useState, useCallback, useRef } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';

export type ApplyStatus = 'idle' | 'generating' | 'applying' | 'success' | 'error';

export function useApplyChanges() {
  const [status, setStatus] = useState<ApplyStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const retryRef = useRef(false);

  const apply = useCallback(async () => {
    // If already running, note that we need another pass when done
    if (inFlightRef.current) {
      retryRef.current = true;
      return;
    }

    const { pendingChanges, graphData, directoryPath, clearPendingChanges } = useGraphStore.getState();
    if (pendingChanges.length === 0 || !graphData || !directoryPath) return;

    inFlightRef.current = true;
    retryRef.current = false;

    setError(null);
    setStatus('generating');

    try {
      // Step 1: generate diffs (retry once for mid-hot-reload)
      let diffRes: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          diffRes = await fetch('/api/diff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ directoryPath, changes: pendingChanges, graphData }),
          });
          break;
        } catch {
          if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
          else throw new Error('Could not reach the server — it may still be restarting.');
        }
      }

      const diffData = await diffRes!.json();
      if (!diffRes!.ok) throw new Error(diffData.error ?? 'Failed to generate diff');

      const diffs = diffData.diffs as { file: string }[];
      if (diffs.length === 0) { setStatus('idle'); return; }

      // Step 2: apply all files
      setStatus('applying');
      const applyRes = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directoryPath,
          diffs,
          approvedFiles: diffs.map((d) => d.file),
        }),
      });

      const applyData = await applyRes.json();
      if (!applyRes.ok) throw new Error(applyData.error ?? 'Failed to apply changes');

      const errors = applyData.errors as { file: string; error: string }[];
      if (errors?.length > 0) throw new Error(errors.map((e) => `${e.file}: ${e.error}`).join('\n'));

      clearPendingChanges();
      setStatus('success');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    } finally {
      inFlightRef.current = false;
      // If changes arrived while we were running, apply them now
      if (retryRef.current) {
        retryRef.current = false;
        apply();
      }
    }
  }, []);

  return { apply, status, error };
}
