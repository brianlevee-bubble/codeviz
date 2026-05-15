'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import type { ImprovementsReport, Improvement, ImprovementCategory, ImprovementPriority } from '@/lib/improvements/types';
import {
  Loader2, AlertCircle, RefreshCw, Sparkles, Shield, Zap,
  Boxes, TestTube, Paintbrush, Database, Radio, Accessibility,
  Wrench, ChevronDown, ChevronRight, FileCode, Lightbulb,
  ChevronsUp, ArrowUp, ArrowRight, ArrowDown, Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Config ───────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ImprovementCategory, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  security:      { label: 'Security',       icon: Shield,        color: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
  performance:   { label: 'Performance',    icon: Zap,           color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
  architecture:  { label: 'Architecture',   icon: Boxes,         color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-blue-200' },
  testing:       { label: 'Testing',        icon: TestTube,      color: 'text-green-600',   bg: 'bg-green-50',   border: 'border-green-200' },
  ux:            { label: 'UX',             icon: Paintbrush,    color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-purple-200' },
  data:          { label: 'Data',           icon: Database,      color: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-200' },
  reliability:   { label: 'Reliability',    icon: Radio,         color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200' },
  accessibility: { label: 'Accessibility',  icon: Accessibility, color: 'text-teal-600',    bg: 'bg-teal-50',    border: 'border-teal-200' },
  dx:            { label: 'Dev Experience', icon: Wrench,        color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200' },
};

const PRIORITY_CONFIG: Record<ImprovementPriority, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  critical: { label: 'Critical', icon: ChevronsUp, color: 'text-red-600',    bg: 'bg-red-100' },
  high:     { label: 'High',     icon: ArrowUp,    color: 'text-orange-600', bg: 'bg-orange-100' },
  medium:   { label: 'Medium',   icon: ArrowRight, color: 'text-amber-600',  bg: 'bg-amber-100' },
  low:      { label: 'Low',      icon: ArrowDown,  color: 'text-slate-500',  bg: 'bg-slate-100' },
};

const EFFORT_LABEL = { small: '~30 min', medium: 'few hours', large: 'days' };
const PRIORITY_ORDER: ImprovementPriority[] = ['critical', 'high', 'medium', 'low'];

// ─── Improvement card ─────────────────────────────────────────────────────────

function ImprovementCard({ item, isQuickWin }: { item: Improvement; isQuickWin: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const catCfg  = CATEGORY_CONFIG[item.category]  ?? CATEGORY_CONFIG.dx;
  const priCfg  = PRIORITY_CONFIG[item.priority]  ?? PRIORITY_CONFIG.low;
  const CatIcon = catCfg.icon;
  const PriIcon = priCfg.icon;
  const hasDetail = !!(item.currentPattern || item.suggestedChange || item.codeExample || item.files.length > 0);

  return (
    <div className={cn(
      'bg-white rounded-xl border transition-shadow hover:shadow-md',
      expanded ? 'shadow-md' : 'shadow-sm',
      item.priority === 'critical' ? 'border-red-200' : 'border-slate-200'
    )}>
      <button
        className="w-full text-left p-4"
        onClick={() => hasDetail && setExpanded(e => !e)}
      >
        <div className="flex items-start gap-3">
          {/* Category icon */}
          <div className={cn('p-1.5 rounded-lg shrink-0 mt-0.5', catCfg.bg)}>
            <CatIcon className={cn('h-3.5 w-3.5', catCfg.color)} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-900 flex-1">{item.title}</span>
              {isQuickWin && (
                <span className="flex items-center gap-0.5 text-[9px] bg-yellow-50 text-yellow-600 border border-yellow-200 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                  <Star className="h-2.5 w-2.5" /> Quick Win
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.description}</p>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={cn('flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full', priCfg.bg, priCfg.color)}>
                <PriIcon className="h-2.5 w-2.5" />{priCfg.label}
              </span>
              <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-full border', catCfg.bg, catCfg.border, catCfg.color)}>
                {catCfg.label}
              </span>
              <span className="text-[10px] text-slate-400">
                {EFFORT_LABEL[item.effort]}
              </span>
              <span className="text-[10px] text-slate-400 italic">
                via {item.sourceTab}
              </span>
              {item.tags.slice(0, 3).map(tag => (
                <span key={tag} className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {hasDetail && (
            <span className="shrink-0 mt-1 text-slate-300">
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          )}
        </div>
      </button>

      {expanded && hasDetail && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {/* Files */}
          {item.files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.files.map(f => (
                <span key={f} className="flex items-center gap-1 text-[10px] font-mono bg-slate-50 text-slate-600 border border-slate-200 px-2 py-1 rounded-lg">
                  <FileCode className="h-2.5 w-2.5 text-slate-400" />{f}
                </span>
              ))}
            </div>
          )}

          {/* Current pattern */}
          {item.currentPattern && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Current pattern</p>
              <p className="text-xs text-slate-600 bg-red-50/50 border border-red-100 rounded-lg px-3 py-2 leading-relaxed">
                {item.currentPattern}
              </p>
            </div>
          )}

          {/* Suggested change */}
          {item.suggestedChange && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Suggested fix</p>
              <p className="text-xs text-slate-700 bg-green-50/50 border border-green-100 rounded-lg px-3 py-2 leading-relaxed">
                {item.suggestedChange}
              </p>
            </div>
          )}

          {/* Code example */}
          {item.codeExample && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Example</p>
              <pre className="text-[10px] font-mono text-slate-700 bg-slate-950/[0.04] rounded-xl p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap border border-slate-100">
                <code>{item.codeExample}</code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'codeviz_improvements_v1_';

function getCached(dirPath: string): ImprovementsReport | null {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY_PREFIX + btoa(unescape(encodeURIComponent(dirPath)))) ?? 'null'); }
  catch { return null; }
}
function setCached(dirPath: string, report: ImprovementsReport) {
  try { localStorage.setItem(CACHE_KEY_PREFIX + btoa(unescape(encodeURIComponent(dirPath))), JSON.stringify(report)); }
  catch { /* ignore */ }
}
function clearCached(dirPath: string) {
  try { localStorage.removeItem(CACHE_KEY_PREFIX + btoa(unescape(encodeURIComponent(dirPath)))); }
  catch { /* ignore */ }
}

export function ImprovementsView() {
  const { directoryPath } = useGraphStore();
  const [report, setReport] = useState<ImprovementsReport | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [filterCategory, setFilterCategory] = useState<ImprovementCategory | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<ImprovementPriority | 'all'>('all');
  const [showQuickWinsOnly, setShowQuickWinsOnly] = useState(false);
  const loadedForPath = useRef<string | null>(null);

  const load = useCallback(async (dirPath: string, force = false) => {
    // Check cache first
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) { setReport(cached); setLoadPhase('done'); return; }
    }

    setLoadPhase('reading');
    setLoadError(null);
    setReport(null);
    setTokenBuffer('');

    const res = await fetch(`/api/improvements?path=${encodeURIComponent(dirPath)}`);
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
          if (ev.phase === 'reading' || ev.phase === 'chunking') setLoadPhase('reading');
          else if (ev.phase === 'analyzing') setLoadPhase('analyzing');
          else if (ev.phase === 'token') setTokenBuffer(t => t + ev.token);
          else if (ev.phase === 'complete') {
            const r = ev.report as ImprovementsReport;
            setReport(r);
            setCached(dirPath, r);
            setLoadPhase('done');
            setTokenBuffer('');
          } else if (ev.phase === 'error') {
            setLoadError(ev.error); setLoadPhase('error');
          }
        } catch { /* skip */ }
      }
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (!directoryPath) return;
    clearCached(directoryPath);
    loadedForPath.current = null;
    load(directoryPath, true);
  }, [directoryPath, load]);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      load(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loadPhase === 'idle' || loadPhase === 'reading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Reading codebase…</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'analyzing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full px-8">
          <Sparkles className="h-10 w-10 text-blue-400 animate-pulse" />
          <p className="text-sm text-slate-600 font-medium text-center">
            Analyzing across all dimensions…
          </p>
          <p className="text-xs text-slate-400 text-center">
            Security · Performance · Architecture · Testing · UX · Data · Reliability
          </p>
          {tokenBuffer && (
            <div className="w-full bg-slate-900 rounded-xl p-3 max-h-28 overflow-hidden relative">
              <pre className="text-[9px] text-slate-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {tokenBuffer.slice(-600)}
              </pre>
              <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-slate-900 to-transparent" />
            </div>
          )}
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

  // ── Filter ──────────────────────────────────────────────────────────────────

  const quickWinSet = new Set(report.quickWinIds);

  const filtered = report.improvements.filter(item => {
    if (showQuickWinsOnly && !quickWinSet.has(item.id)) return false;
    if (filterCategory !== 'all' && item.category !== filterCategory) return false;
    if (filterPriority !== 'all' && item.priority !== filterPriority) return false;
    return true;
  });

  // Group by priority
  const grouped = PRIORITY_ORDER.map(priority => ({
    priority,
    items: filtered.filter(i => i.priority === priority),
  })).filter(g => g.items.length > 0);

  // Stats
  const counts = PRIORITY_ORDER.reduce((acc, p) => {
    acc[p] = report.improvements.filter(i => i.priority === p).length;
    return acc;
  }, {} as Record<string, number>);

  const catCounts = Object.keys(CATEGORY_CONFIG).reduce((acc, c) => {
    const count = report.improvements.filter(i => i.category === c).length;
    if (count > 0) acc[c] = count;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <h2 className="text-base font-semibold text-slate-900">Recommended Improvements</h2>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed">{report.summary}</p>

            {/* Priority counts */}
            <div className="flex gap-3 mt-3">
              {PRIORITY_ORDER.map(p => {
                const cfg = PRIORITY_CONFIG[p];
                const n = counts[p] ?? 0;
                if (!n) return null;
                return (
                  <button key={p}
                    onClick={() => setFilterPriority(filterPriority === p ? 'all' : p)}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border',
                      filterPriority === p
                        ? cn(cfg.bg, cfg.color, 'border-current')
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                    )}>
                    <cfg.icon className="h-3 w-3" />
                    {n} {cfg.label}
                  </button>
                );
              })}

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setShowQuickWinsOnly(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all',
                    showQuickWinsOnly
                      ? 'bg-yellow-50 text-yellow-700 border-yellow-300'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  )}>
                  <Star className="h-3 w-3" />
                  Quick Wins ({quickWinSet.size})
                </button>

                <Button size="sm" variant="ghost" onClick={handleRefresh}
                  className="h-7 text-xs text-slate-400 gap-1.5">
                  <RefreshCw className="h-3 w-3" /> Re-analyze
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          <button
            onClick={() => setFilterCategory('all')}
            className={cn(
              'text-[10px] px-2.5 py-1 rounded-full border font-medium transition-colors',
              filterCategory === 'all'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            )}>
            All ({report.improvements.length})
          </button>
          {(Object.entries(catCounts) as [ImprovementCategory, number][]).map(([cat, count]) => {
            const cfg = CATEGORY_CONFIG[cat];
            if (!cfg) return null;
            const Icon = cfg.icon;
            return (
              <button key={cat}
                onClick={() => setFilterCategory(filterCategory === cat ? 'all' : cat)}
                className={cn(
                  'flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-full border font-medium transition-all',
                  filterCategory === cat
                    ? cn(cfg.bg, cfg.color, cfg.border)
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                )}>
                <Icon className="h-2.5 w-2.5" />
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Cards ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-400">
            <Lightbulb className="h-8 w-8 opacity-40" />
            <p className="text-sm">No improvements match the current filters</p>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl">
            {grouped.map(({ priority, items }) => {
              const cfg = PRIORITY_CONFIG[priority];
              const Icon = cfg.icon;
              return (
                <div key={priority}>
                  <div className="flex items-center gap-2 mb-3">
                    <Icon className={cn('h-4 w-4', cfg.color)} />
                    <h3 className={cn('text-xs font-semibold uppercase tracking-wide', cfg.color)}>
                      {cfg.label} Priority
                    </h3>
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', cfg.bg, cfg.color)}>
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {items.map(item => (
                      <ImprovementCard
                        key={item.id}
                        item={item}
                        isQuickWin={quickWinSet.has(item.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
