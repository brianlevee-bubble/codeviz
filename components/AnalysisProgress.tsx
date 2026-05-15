'use client';

import { useEffect, useRef } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { AnalysisEvent } from '@/lib/types';
import { setCachedAnalysis } from '@/lib/analysis-cache';

interface Props {
  directoryPath: string;
  onComplete: () => void;
}

export function AnalysisProgress({ directoryPath, onComplete }: Props) {
  const {
    analysisPhase,
    analysisMessage,
    analysisTokens,
    setAnalysisPhase,
    appendAnalysisToken,
    setGraphData,
    setDirectoryPath,
  } = useGraphStore();

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    setDirectoryPath(directoryPath);
    setAnalysisPhase('reading', 'Starting...');

    async function run() {
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ directoryPath }),
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({ error: 'Request failed' }));
          setAnalysisPhase('error', err.error ?? 'Request failed');
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const event = JSON.parse(line.slice(6)) as AnalysisEvent;

              if (event.phase === 'reading' || event.phase === 'chunking') {
                setAnalysisPhase(event.phase, event.message ?? '');
              } else if (event.phase === 'analyzing') {
                setAnalysisPhase('analyzing', event.message ?? '');
                if (event.token) appendAnalysisToken(event.token);
              } else if (event.phase === 'complete' && event.graph) {
                setGraphData(event.graph);
                setCachedAnalysis(directoryPath, event.graph);
                setAnalysisPhase('complete', 'Analysis complete');
                onComplete();
              } else if (event.phase === 'error') {
                setAnalysisPhase('error', event.error ?? 'Unknown error');
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to connect';
        setAnalysisPhase('error', message);
      }
    }

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
      {analysisPhase === 'error' ? (
        <div className="max-w-md text-center space-y-3">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
          <p className="text-sm font-medium text-red-700">Analysis failed</p>
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{analysisMessage}</p>
        </div>
      ) : analysisPhase === 'complete' ? (
        <div className="text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
          <p className="text-sm text-green-700 font-medium">Analysis complete</p>
        </div>
      ) : (
        <div className="max-w-sm w-full space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-700">{analysisMessage || 'Analyzing...'}</p>
              <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{
                    width:
                      analysisPhase === 'reading'
                        ? '15%'
                        : analysisPhase === 'chunking'
                          ? '35%'
                          : `${Math.min(35 + (analysisTokens.length / 100), 90)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {analysisPhase === 'analyzing' && analysisTokens && (
            <div className="bg-slate-900 rounded-lg p-3 max-h-32 overflow-hidden relative">
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {analysisTokens.slice(-500)}
              </pre>
              <div className="absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-slate-900 to-transparent" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
