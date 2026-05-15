'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import type { DeadCodeReport, ExportedSymbol, ExportCategory, DeadCodeSafety } from '@/lib/dead-code/types';
import {
  Loader2, AlertCircle, RefreshCw, Trash2, FileCode, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ExportCategory, { color: string; bg: string; border: string }> = {
  Component: { color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  Function:  { color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  Type:      { color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  Constant:  { color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  Class:     { color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  Default:   { color: 'text-slate-700',  bg: 'bg-slate-100', border: 'border-slate-200' },
  Unknown:   { color: 'text-slate-500',  bg: 'bg-slate-50',  border: 'border-slate-200' },
};

const SAFETY_CONFIG: Record<DeadCodeSafety, { label: string; color: string; bg: string; border: string }> = {
  safe_to_delete: { label: 'Safe to delete', color: 'text-red-700',    bg: 'bg-red-50',   border: 'border-red-200' },
  needs_review:   { label: 'Needs review',   color: 'text-amber-700',  bg: 'bg-amber-50', border: 'border-amber-200' },
  external_api:   { label: 'External API',   color: 'text-slate-600',  bg: 'bg-slate-50', border: 'border-slate-200' },
};

// ─── Export symbol card ───────────────────────────────────────────────────────

function SymbolCard({ symbol }: { symbol: ExportedSymbol }) {
  const catCfg = CATEGORY_CONFIG[symbol.category] ?? CATEGORY_CONFIG.Unknown;
  const safCfg = SAFETY_CONFIG[symbol.safety] ?? SAFETY_CONFIG.needs_review;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0', catCfg.color, catCfg.bg, catCfg.border)}>
              {symbol.category}
            </span>
            <span className="text-sm font-mono font-semibold text-slate-900 truncate">{symbol.name}</span>
          </div>
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0', safCfg.color, safCfg.bg, safCfg.border)}>
            {safCfg.label}
          </span>
        </div>
        <div className="mt-2 rounded-md bg-slate-900 px-2.5 py-2">
          <pre className="text-[10px] font-mono text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
            <code>{symbol.exportLine}</code>
          </pre>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <p className="text-[9px] text-slate-400 font-mono">line {symbol.line}</p>
          <p className="text-[9px] text-slate-400 italic">{symbol.safetyReason}</p>
        </div>
      </div>
    </div>
  );
}

// ─── File row in sidebar ──────────────────────────────────────────────────────

function FileRow({ filePath, count, isSelected, onClick }: {
  filePath: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1];
  const dir = parts.slice(0, -1).join('/');

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2 rounded-lg transition-colors border',
        isSelected
          ? 'bg-blue-50 border-blue-200'
          : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <FileCode className="h-3 w-3 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-800 truncate">{filename}</p>
            {dir && <p className="text-[9px] text-slate-400 truncate">{dir}</p>}
          </div>
        </div>
        <span className="shrink-0 text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
          {count}
        </span>
      </div>
    </button>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_deadcode_v1_';
function getCached(dirPath: string): DeadCodeReport | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + btoa(dirPath));
    if (!raw) return null;
    return JSON.parse(raw) as DeadCodeReport;
  } catch { return null; }
}
function setCached(dirPath: string, report: DeadCodeReport) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(report)); } catch { /* quota */ }
}
function clearCached(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function DeadCodeView() {
  const { directoryPath } = useGraphStore();
  const [report, setReport] = useState<DeadCodeReport | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [filterSafety, setFilterSafety] = useState<DeadCodeSafety | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<ExportCategory | 'all'>('all');
  const loadedForPath = useRef<string | null>(null);

  const load = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) { setReport(cached); setLoadPhase('done'); return; }
    }

    setLoadPhase('reading');
    setLoadError(null);
    setReport(null);
    setSelectedFile(null);

    const res = await fetch(`/api/dead-code?path=${encodeURIComponent(dirPath)}`);
    if (!res.ok || !res.body) { setLoadError('Failed to connect'); setLoadPhase('error'); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.phase === 'reading') setLoadPhase('reading');
          else if (ev.phase === 'analyzing') setLoadPhase('analyzing');
          else if (ev.phase === 'complete') {
            const r = ev.graph as DeadCodeReport;
            setCached(dirPath, r);
            setReport(r);
            // Select the most affected file by default
            if (r.stats.mostAffectedFile) setSelectedFile(r.stats.mostAffectedFile);
            else if (r.deadExports.length > 0) setSelectedFile(r.deadExports[0].file);
            setLoadPhase('done');
          } else if (ev.phase === 'error') {
            setLoadError(ev.error);
            setLoadPhase('error');
          }
        } catch { /* skip */ }
      }
    }
  }, []);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      load(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  // ── Loading states ─────────────────────────────────────────────────────────

  if (loadPhase === 'idle' || loadPhase === 'reading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Walking files…</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'analyzing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Cross-referencing exports…</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500 max-w-sm text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => directoryPath && load(directoryPath, true)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  // ── Build file list with counts ────────────────────────────────────────────

  // Apply filters
  const filteredExports = report.deadExports.filter(sym => {
    if (filterSafety !== 'all' && sym.safety !== filterSafety) return false;
    if (filterCategory !== 'all' && sym.category !== filterCategory) return false;
    return true;
  });

  const fileCounts = new Map<string, number>();
  for (const sym of filteredExports) {
    fileCounts.set(sym.file, (fileCounts.get(sym.file) ?? 0) + 1);
  }
  const fileList = Array.from(fileCounts.entries()).sort((a, b) => b[1] - a[1]);

  const selectedSymbols = filteredExports.filter(sym => sym.file === selectedFile);

  const safeCount = report.deadExports.filter(s => s.safety === 'safe_to_delete').length;
  const reviewCount = report.deadExports.filter(s => s.safety === 'needs_review').length;

  const categories = [...new Set(report.deadExports.map(s => s.category))] as ExportCategory[];

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              <h2 className="text-sm font-semibold text-slate-900">Dead Code</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { if (directoryPath) { clearCached(directoryPath); load(directoryPath, true); } }}
              className="h-6 w-6 p-0 text-slate-400" title="Re-scan">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Stats */}
          <div className="flex gap-2 mt-2.5">
            <div className="flex-1 bg-red-50 rounded-lg px-2 py-1.5 text-center">
              <p className="text-sm font-bold text-red-700">{safeCount}</p>
              <p className="text-[9px] text-red-500 leading-tight">safe to<br/>delete</p>
            </div>
            <div className="flex-1 bg-amber-50 rounded-lg px-2 py-1.5 text-center">
              <p className="text-sm font-bold text-amber-700">{reviewCount}</p>
              <p className="text-[9px] text-amber-500 leading-tight">needs<br/>review</p>
            </div>
            <div className="flex-1 bg-slate-50 rounded-lg px-2 py-1.5 text-center">
              <p className="text-sm font-bold text-slate-600">{report.stats.totalExports}</p>
              <p className="text-[9px] text-slate-400 leading-tight">total<br/>exports</p>
            </div>
          </div>
        </div>

        {/* Safety filter */}
        <div className="px-3 py-2 border-b border-slate-100 flex gap-1 flex-wrap">
          {(['all', 'safe_to_delete', 'needs_review', 'external_api'] as const).map(s => {
            const cfg = s === 'all' ? null : SAFETY_CONFIG[s];
            return (
              <button key={s} onClick={() => setFilterSafety(s)}
                className={cn(
                  'text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors',
                  filterSafety === s
                    ? cfg ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-slate-700 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                )}>
                {s === 'all' ? 'All' : s === 'safe_to_delete' ? 'Safe' : s === 'needs_review' ? 'Review' : 'External'}
              </button>
            );
          })}
        </div>

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="px-3 py-2 border-b border-slate-100 flex gap-1 flex-wrap">
            <button onClick={() => setFilterCategory('all')}
              className={cn('text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors',
                filterCategory === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
              All types
            </button>
            {categories.map(cat => {
              const cfg = CATEGORY_CONFIG[cat];
              return (
                <button key={cat} onClick={() => setFilterCategory(cat)}
                  className={cn('text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors',
                    filterCategory === cat ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {fileList.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              {filteredExports.length === 0 && report.deadExports.length > 0
                ? 'No items match current filters'
                : '🎉 No dead exports found!'}
            </p>
          ) : (
            fileList.map(([file, count]) => (
              <FileRow
                key={file}
                filePath={file}
                count={count}
                isSelected={selectedFile === file}
                onClick={() => setSelectedFile(file)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFile && selectedSymbols.length > 0 ? (
          <>
            {/* File header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-mono text-slate-700">{selectedFile}</span>
                <span className="text-xs text-slate-400">
                  — {selectedSymbols.length} unused export{selectedSymbols.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Symbols list */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl space-y-2">
                {selectedSymbols.map(sym => (
                  <SymbolCard key={sym.id} symbol={sym} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            {report.deadExports.length === 0 ? (
              <div className="text-center text-slate-400">
                <p className="text-4xl mb-3">🎉</p>
                <p className="text-sm font-medium text-slate-600">No dead exports found</p>
                <p className="text-xs text-slate-400 mt-1">All {report.stats.totalExports} exported symbols are imported somewhere</p>
              </div>
            ) : (
              <div className="text-center text-slate-400">
                <ChevronRight className="h-8 w-8 mx-auto mb-2 opacity-30 rotate-180" />
                <p className="text-sm">Select a file to inspect its unused exports</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
