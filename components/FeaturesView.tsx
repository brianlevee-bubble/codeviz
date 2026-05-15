'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Clock,
  TrendingUp,
  ChevronRight,
  FlaskConical,
  Wrench,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AppFeature, FeatureCategory, FeatureImpact, FeatureEffort, FeatureDetails } from '@/lib/features/types';

// ─── Meta maps ────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<FeatureCategory, { label: string; icon: string; color: string }> = {
  authentication: { label: 'Authentication', icon: '🔐', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  notifications:  { label: 'Notifications',  icon: '🔔', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  search:         { label: 'Search',          icon: '🔍', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  payments:       { label: 'Payments',        icon: '💳', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  analytics:      { label: 'Analytics',       icon: '📊', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  collaboration:  { label: 'Collaboration',   icon: '👥', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  content:        { label: 'Content',         icon: '📝', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  productivity:   { label: 'Productivity',    icon: '⚡', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  onboarding:     { label: 'Onboarding',      icon: '🚀', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  settings:       { label: 'Settings',        icon: '⚙️',  color: 'bg-slate-50 text-slate-600 border-slate-200' },
  integrations:   { label: 'Integrations',    icon: '🔗', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  other:          { label: 'Other',           icon: '📦', color: 'bg-slate-50 text-slate-600 border-slate-200' },
};

const IMPACT_META: Record<FeatureImpact, { label: string; color: string; dot: string }> = {
  high:   { label: 'High impact',   color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  medium: { label: 'Medium impact', color: 'text-amber-700 bg-amber-50 border-amber-200',       dot: 'bg-amber-400' },
  low:    { label: 'Low impact',    color: 'text-slate-500 bg-slate-50 border-slate-200',        dot: 'bg-slate-300' },
};

const EFFORT_META: Record<FeatureEffort, { label: string; color: string }> = {
  small:  { label: 'Days to build',   color: 'text-emerald-600' },
  medium: { label: 'Weeks to build',  color: 'text-amber-600' },
  large:  { label: 'Months to build', color: 'text-rose-600' },
};

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_features_v2_';

function getCached(dirPath: string): AppFeature[] | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}
function setCached(dirPath: string, features: AppFeature[]) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(features)); } catch { /* quota */ }
}
export function clearFeaturesCache(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Detail cache ─────────────────────────────────────────────────────────────

const DETAIL_CACHE_PREFIX = 'codeviz_feature_detail_v1_';

function getCachedDetail(featureId: string, dirPath: string): FeatureDetails | null {
  try { return JSON.parse(localStorage.getItem(`${DETAIL_CACHE_PREFIX}${featureId}_${btoa(dirPath)}`) ?? 'null'); } catch { return null; }
}
function setCachedDetail(featureId: string, dirPath: string, details: FeatureDetails) {
  try { localStorage.setItem(`${DETAIL_CACHE_PREFIX}${featureId}_${btoa(dirPath)}`, JSON.stringify(details)); } catch { /* quota */ }
}

// ─── Test type badge ──────────────────────────────────────────────────────────

const TEST_TYPE_META = {
  unit:        { label: 'Unit',        color: 'bg-blue-50 text-blue-700 border-blue-200' },
  integration: { label: 'Integration', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  e2e:         { label: 'E2E',         color: 'bg-teal-50 text-teal-700 border-teal-200' },
};

const PRIORITY_META = {
  high:   { label: 'High',   color: 'bg-rose-50 text-rose-700 border-rose-200' },
  medium: { label: 'Medium', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  low:    { label: 'Low',    color: 'bg-slate-50 text-slate-500 border-slate-200' },
};

// ─── Feature detail panel ─────────────────────────────────────────────────────

function FeatureDetail({ feature, dirPath }: { feature: AppFeature; dirPath: string }) {
  const cat = CATEGORY_META[feature.category] ?? CATEGORY_META.other;
  const impact = IMPACT_META[feature.impact];
  const effort = EFFORT_META[feature.effort];
  const isExisting = feature.status === 'existing';

  const [details, setDetails] = useState<FeatureDetails | null>(null);
  const [detailPhase, setDetailPhase] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const loadedFor = useRef<string | null>(null);

  const fetchDetails = useCallback(async (fId: string, fObj: AppFeature, dp: string) => {
    setDetails(null);
    setDetailPhase('loading');

    try {
      const res = await fetch('/api/features/detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dp, feature: fObj }),
      });
      if (!res.ok || !res.body) { loadedFor.current = null; setDetailPhase('error'); return; }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.phase === 'complete') {
              setDetails(event.details);
              setDetailPhase('done');
              setCachedDetail(fId, dp, event.details);
            } else if (event.phase === 'error') {
              loadedFor.current = null;
              setDetailPhase('error');
            }
          } catch { /* ignore */ }
        }
      }
    } catch {
      loadedFor.current = null;
      setDetailPhase('error');
    }
  }, []);

  useEffect(() => {
    if (loadedFor.current === feature.id) return;
    loadedFor.current = feature.id;
    setDetails(null);
    setDetailPhase('idle');

    const cached = getCachedDetail(feature.id, dirPath);
    if (cached) {
      setDetails(cached);
      setDetailPhase('done');
      return;
    }

    fetchDetails(feature.id, feature, dirPath);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feature.id]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className={cn('px-7 py-6 border-b border-slate-100', isExisting ? 'bg-white' : 'bg-gradient-to-br from-violet-50/60 to-white')}>
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none mt-0.5">{cat.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-lg font-semibold text-slate-900">{feature.name}</h2>
              {isExisting ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Built
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                  <Sparkles className="h-2.5 w-2.5" /> Suggested
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-500 italic">{feature.tagline}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-7">
        <div className="max-w-xl space-y-6">

          {/* Description */}
          <div>
            <p className="text-sm text-slate-700 leading-relaxed">{feature.description}</p>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 flex-wrap">
            <div className={cn('flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border', impact.color)}>
              <TrendingUp className="h-3 w-3" />
              {impact.label}
            </div>
            {!isExisting && (
              <div className={cn('flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50', effort.color)}>
                <Clock className="h-3 w-3" />
                {effort.label}
              </div>
            )}
            <div className={cn('flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border', cat.color)}>
              {cat.label}
            </div>
          </div>

          {/* ── Dynamic detail sections ────────────────────────────── */}
          {detailPhase === 'loading' && (
            <div className="flex items-center gap-2 text-slate-400 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span className="text-xs">Analyzing feature in depth…</span>
            </div>
          )}

          {detailPhase === 'done' && details && (
            <>
              {/* How it works (existing only) */}
              {isExisting && details.howItWorks && (
                <div className="bg-sky-50 border border-sky-100 rounded-xl px-4 py-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen className="h-3.5 w-3.5 text-sky-500" />
                    <span className="text-xs font-semibold text-sky-700 uppercase tracking-wide">How it works</span>
                  </div>
                  <p className="text-sm text-sky-900 leading-relaxed">{details.howItWorks}</p>
                </div>
              )}

              {/* Gaps (existing features only) */}
              {isExisting && feature.gaps && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Known gaps</span>
                  </div>
                  <p className="text-sm text-amber-800 leading-relaxed">{feature.gaps}</p>
                </div>
              )}

              {/* Suggested tests */}
              {details.suggestedTests.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <FlaskConical className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Tests to add</span>
                  </div>
                  <div className="space-y-2">
                    {details.suggestedTests.map((t, i) => {
                      const tm = TEST_TYPE_META[t.type] ?? TEST_TYPE_META.unit;
                      return (
                        <div key={i} className="border border-slate-100 rounded-lg px-3 py-3 bg-white">
                          <div className="flex items-start gap-2">
                            <span className={cn('inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5', tm.color)}>
                              {tm.label}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-800 mb-0.5">{t.title}</p>
                              <p className="text-xs text-slate-500 leading-relaxed">{t.description}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Improvements */}
              {details.improvements.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Wrench className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Ways to improve</span>
                  </div>
                  <div className="space-y-2">
                    {details.improvements.map((imp, i) => {
                      const pm = PRIORITY_META[imp.priority] ?? PRIORITY_META.medium;
                      return (
                        <div key={i} className="border border-slate-100 rounded-lg px-3 py-3 bg-white">
                          <div className="flex items-start gap-2">
                            <span className={cn('inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 mt-0.5', pm.color)}>
                              {pm.label}
                            </span>
                            <div>
                              <p className="text-xs font-semibold text-slate-800 mb-0.5">{imp.title}</p>
                              <p className="text-xs text-slate-500 leading-relaxed">{imp.description}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {detailPhase === 'error' && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-slate-400 italic">Could not load additional details.</p>
              <button
                onClick={() => { loadedFor.current = null; fetchDetails(feature.id, feature, dirPath); }}
                className="text-xs text-violet-500 hover:text-violet-700 underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar feature row ──────────────────────────────────────────────────────

function FeatureRow({ feature, isSelected, onClick }: {
  feature: AppFeature;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cat = CATEGORY_META[feature.category] ?? CATEGORY_META.other;
  const impact = IMPACT_META[feature.impact];
  const isExisting = feature.status === 'existing';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-colors group',
        isSelected
          ? 'bg-violet-50 border border-violet-200'
          : 'border border-transparent hover:bg-slate-50 hover:border-slate-100'
      )}
    >
      <div className="flex items-start gap-2">
        <span className="text-base leading-none mt-0.5 shrink-0">{cat.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={cn('text-xs font-semibold truncate', isSelected ? 'text-violet-900' : 'text-slate-800')}>
              {feature.name}
            </span>
            {isSelected && <ChevronRight className="h-3 w-3 text-violet-400 shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5">
            {isExisting ? (
              <span className="text-[9px] font-semibold text-emerald-600 flex items-center gap-0.5">
                <CheckCircle2 className="h-2 w-2" /> Built
              </span>
            ) : (
              <span className="text-[9px] font-semibold text-violet-500 flex items-center gap-0.5">
                <Sparkles className="h-2 w-2" /> Suggested
              </span>
            )}
            <span className="text-[9px] text-slate-300">·</span>
            <span className={cn('inline-block w-1.5 h-1.5 rounded-full shrink-0', impact.dot)} />
            <span className="text-[9px] text-slate-400 truncate">{cat.label}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function FeaturesView() {
  const { directoryPath } = useGraphStore();

  const [features, setFeatures] = useState<AppFeature[]>([]);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'scanning' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'existing' | 'suggested'>('all');
  const loadedForPath = useRef<string | null>(null);

  const load = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) {
        setFeatures(cached);
        setSelectedId(cached[0]?.id ?? null);
        setLoadPhase('done');
        return;
      }
    }
    setLoadPhase('scanning');
    setLoadError(null);
    setFeatures([]);
    setTokenBuffer('');

    const res = await fetch(`/api/features?path=${encodeURIComponent(dirPath)}`);
    if (!res.ok || !res.body) {
      let msg = 'Failed to connect to features API';
      try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* ignore */ }
      setLoadError(msg);
      setLoadPhase('error');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          switch (event.phase) {
            case 'scanning':  setLoadPhase('scanning');  break;
            case 'base':      setLoadPhase('analyzing'); break;
            case 'analyzing': setLoadPhase('analyzing'); break;
            case 'token':     setTokenBuffer(t => t + event.token); break;
            case 'complete': {
              const fs: AppFeature[] = event.features ?? [];
              setFeatures(fs);
              setSelectedId(fs[0]?.id ?? null);
              setLoadPhase('done');
              setTokenBuffer('');
              setCached(dirPath, fs);
              break;
            }
            case 'error':
              setLoadError(event.error);
              setLoadPhase('error');
              break;
          }
        } catch { /* ignore */ }
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

  const isAnalyzing = loadPhase === 'scanning' || loadPhase === 'analyzing';

  if (loadPhase === 'idle' || (isAnalyzing && features.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">{loadPhase === 'analyzing' ? 'Thinking like a product manager…' : 'Scanning codebase…'}</span>
          {tokenBuffer && (
            <div className="w-64 bg-slate-50 rounded-lg p-2 text-[9px] font-mono text-slate-400 max-h-20 overflow-hidden">
              {tokenBuffer.slice(-300)}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loadPhase === 'error' && features.length === 0) {
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

  const existing = features.filter(f => f.status === 'existing');
  const suggested = features.filter(f => f.status === 'suggested');
  const visible = filter === 'existing' ? existing : filter === 'suggested' ? suggested : features;
  const selected = features.find(f => f.id === selectedId) ?? null;

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="w-64 shrink-0 border-r border-slate-200 flex flex-col bg-white overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-900">Features</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => directoryPath && load(directoryPath, true)}
              disabled={isAnalyzing}
              className="h-6 w-6 p-0 text-slate-400"
              title="Re-analyze"
            >
              <RefreshCw className={cn('h-3 w-3', isAnalyzing && 'animate-spin')} />
            </Button>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {([
              { key: 'all',       label: 'All',       count: features.length },
              { key: 'existing',  label: 'Built',     count: existing.length },
              { key: 'suggested', label: 'To add',    count: suggested.length },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  'flex-1 text-[10px] font-semibold py-1 rounded-md transition-colors',
                  filter === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={cn('ml-1', filter === tab.key ? 'text-slate-400' : 'text-slate-400')}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Analyzing state */}
        {isAnalyzing && features.length === 0 && (
          <div className="flex-1 p-4 flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mt-6" />
            <p className="text-xs text-center">Analyzing your app…</p>
          </div>
        )}

        {/* Feature list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {visible.map(f => (
            <FeatureRow
              key={f.id}
              feature={f}
              isSelected={selectedId === f.id}
              onClick={() => setSelectedId(f.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selected ? (
        <FeatureDetail feature={selected} dirPath={directoryPath!} />
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="flex flex-col items-center gap-2">
            <Sparkles className="h-8 w-8 text-slate-300" />
            <p className="text-sm">Select a feature</p>
          </div>
        </div>
      )}
    </div>
  );
}
