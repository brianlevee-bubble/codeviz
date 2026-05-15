'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import { useTabReady } from '@/lib/hooks/use-tab-ready';
import type { ApiContractsReport, ApiEndpoint, HttpMethod, AuthType } from '@/lib/api-contracts/types';
import {
  Loader2, AlertCircle, RefreshCw, Radio, Search,
  Lock, Globe, ChevronDown, ChevronRight, FileCode, Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Config ───────────────────────────────────────────────────────────────────

const METHOD_CONFIG: Record<HttpMethod, { color: string; bg: string; border: string }> = {
  GET:     { color: 'text-green-700',  bg: 'bg-green-100',  border: 'border-green-300' },
  POST:    { color: 'text-blue-700',   bg: 'bg-blue-100',   border: 'border-blue-300' },
  PUT:     { color: 'text-amber-700',  bg: 'bg-amber-100',  border: 'border-amber-300' },
  PATCH:   { color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-300' },
  DELETE:  { color: 'text-red-700',    bg: 'bg-red-100',    border: 'border-red-300' },
  HEAD:    { color: 'text-slate-700',  bg: 'bg-slate-100',  border: 'border-slate-300' },
  OPTIONS: { color: 'text-slate-700',  bg: 'bg-slate-100',  border: 'border-slate-300' },
};

const AUTH_CONFIG: Record<AuthType, { label: string; color: string; bg: string }> = {
  none:    { label: 'Public',    color: 'text-slate-500',  bg: 'bg-slate-100' },
  session: { label: 'Session',   color: 'text-green-700',  bg: 'bg-green-50' },
  jwt:     { label: 'JWT',       color: 'text-blue-700',   bg: 'bg-blue-50' },
  api_key: { label: 'API Key',   color: 'text-purple-700', bg: 'bg-purple-50' },
  oauth:   { label: 'OAuth',     color: 'text-indigo-700', bg: 'bg-indigo-50' },
  basic:   { label: 'Basic',     color: 'text-orange-700', bg: 'bg-orange-50' },
  unknown: { label: 'Auth?',     color: 'text-amber-700',  bg: 'bg-amber-50' },
};

// ─── Method badge ─────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: HttpMethod }) {
  const cfg = METHOD_CONFIG[method] ?? METHOD_CONFIG.GET;
  return (
    <span className={cn('inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono', cfg.color, cfg.bg, cfg.border)}>
      {method}
    </span>
  );
}

// ─── Auth badge ───────────────────────────────────────────────────────────────

function AuthBadge({ auth }: { auth: AuthType }) {
  const cfg = AUTH_CONFIG[auth] ?? AUTH_CONFIG.unknown;
  const Icon = auth === 'none' ? Globe : Lock;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full', cfg.color, cfg.bg)}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

// ─── Sidebar endpoint row ─────────────────────────────────────────────────────

function EndpointRow({ endpoint, isSelected, onClick }: {
  endpoint: ApiEndpoint;
  isSelected: boolean;
  onClick: () => void;
}) {
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
      <div className="flex items-center gap-2">
        <MethodBadge method={endpoint.method} />
        <span className="text-xs font-mono text-slate-600 truncate flex-1">{endpoint.path}</span>
      </div>
      <p className="text-[10px] text-slate-400 mt-0.5 truncate pl-0.5">{endpoint.summary}</p>
    </button>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function EndpointDetail({ endpoint }: { endpoint: ApiEndpoint }) {
  const [snippetOpen, setSnippetOpen] = useState(false);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <MethodBadge method={endpoint.method} />
            <span className="text-lg font-mono font-semibold text-slate-900">{endpoint.path}</span>
            <AuthBadge auth={endpoint.auth} />
          </div>
          <p className="text-sm text-slate-500 mt-2">{endpoint.summary}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <FileCode className="h-3 w-3" />{endpoint.file}
            </span>
          </div>
          {endpoint.requiredRoles && endpoint.requiredRoles.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <Shield className="h-3 w-3 text-purple-500" />
              <div className="flex gap-1 flex-wrap">
                {endpoint.requiredRoles.map(r => (
                  <span key={r} className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Params */}
        {endpoint.params.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Parameters</h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Name</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">In</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Type</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Required</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoint.params.map((p, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-slate-800">{p.name}</td>
                      <td className="px-3 py-2 text-slate-500">{p.location}</td>
                      <td className="px-3 py-2 font-mono text-blue-600">{p.type}</td>
                      <td className="px-3 py-2 text-slate-500">{p.required ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Request body */}
        {endpoint.requestBody && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Request Body</h3>
            <div className="rounded-xl border border-slate-200 bg-slate-900 p-4">
              <p className="text-[9px] text-slate-400 mb-1.5 font-medium">{endpoint.requestBody.contentType}</p>
              <pre className="text-xs font-mono text-green-300 whitespace-pre-wrap break-words leading-relaxed">
                <code>{endpoint.requestBody.schema}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Response body */}
        {endpoint.responseBody && (
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Response <span className="text-slate-400 font-normal">{endpoint.responseBody.statusCode}</span>
            </h3>
            <div className="rounded-xl border border-slate-200 bg-slate-900 p-4">
              <pre className="text-xs font-mono text-blue-300 whitespace-pre-wrap break-words leading-relaxed">
                <code>{endpoint.responseBody.schema}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Code snippet */}
        {endpoint.codeSnippet && (
          <div>
            <button
              onClick={() => setSnippetOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 hover:text-slate-700 transition-colors"
            >
              {snippetOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Implementation
            </button>
            {snippetOpen && (
              <div className="rounded-xl border border-slate-200 bg-slate-900 p-4">
                <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words leading-relaxed">
                  <code>{endpoint.codeSnippet}</code>
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_apicontracts_v1_';
function getCached(dirPath: string): ApiContractsReport | null {
  try {
    const key = CACHE_PREFIX + btoa(dirPath);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ApiContractsReport;
  } catch { return null; }
}
function setCached(dirPath: string, report: ApiContractsReport) {
  try {
    const key = CACHE_PREFIX + btoa(dirPath);
    localStorage.setItem(key, JSON.stringify(report));
  } catch { /* quota exceeded */ }
}
function clearCached(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function ApiContractsView() {
  const { directoryPath } = useGraphStore();
  const cacheKey = directoryPath ? `codeviz_apicontracts_v1_${btoa(directoryPath)}` : '';
  const tabReady = useTabReady('api-contracts', cacheKey);
  const [report, setReport] = useState<ApiContractsReport | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [filterAuth, setFilterAuth] = useState<string>('all');
  const [search, setSearch] = useState('');
  const loadedForPath = useRef<string | null>(null);

  const load = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) { setReport(cached); setLoadPhase('done'); return; }
    }

    setLoadPhase('reading');
    setLoadError(null);
    setReport(null);
    setTokenBuffer('');
    setSelectedId(null);

    const res = await fetch(`/api/api-contracts?path=${encodeURIComponent(dirPath)}`);
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
          else if (ev.phase === 'token') setTokenBuffer(t => t + ev.token);
          else if (ev.phase === 'complete') {
            const r = ev.graph as ApiContractsReport;
            setCached(dirPath, r);
            setReport(r);
            if (r.endpoints.length > 0) setSelectedId(r.endpoints[0].id);
            setLoadPhase('done');
            setTokenBuffer('');
          } else if (ev.phase === 'error') {
            setLoadError(ev.error);
            setLoadPhase('error');
          }
        } catch { /* skip */ }
      }
    }
  }, []);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current && tabReady) {
      loadedForPath.current = directoryPath;
      load(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath, tabReady]);

  // ── Loading states ─────────────────────────────────────────────────────────

  if (!tabReady || loadPhase === 'idle' || loadPhase === 'reading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">{!tabReady ? 'Preparing…' : 'Finding API routes…'}</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'analyzing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full px-8">
          <Radio className="h-10 w-10 text-blue-400 animate-pulse" />
          <p className="text-sm text-slate-600 font-medium">Analyzing API routes…</p>
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

  // ── Filtering ──────────────────────────────────────────────────────────────

  const filtered = report.endpoints.filter(ep => {
    if (filterMethod !== 'all' && ep.method !== filterMethod) return false;
    if (filterAuth === 'protected' && ep.auth === 'none') return false;
    if (filterAuth === 'public' && ep.auth !== 'none') return false;
    if (search && !ep.path.toLowerCase().includes(search.toLowerCase()) &&
        !ep.summary.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const selected = report.endpoints.find(ep => ep.id === selectedId) ?? null;

  // Group filtered endpoints by category
  const grouped: Record<string, ApiEndpoint[]> = {};
  for (const ep of filtered) {
    (grouped[ep.category] ??= []).push(ep);
  }

  const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">API Contracts</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { if (directoryPath) { clearCached(directoryPath); load(directoryPath, true); } }}
              className="h-6 w-6 p-0 text-slate-400" title="Re-analyze">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Stats */}
          <div className="flex gap-3 mt-2.5">
            <div className="flex-1 bg-blue-50 rounded-lg px-2.5 py-1.5 text-center">
              <p className="text-sm font-bold text-blue-700">{report.stats.totalEndpoints}</p>
              <p className="text-[9px] text-blue-500">endpoints</p>
            </div>
            <div className="flex-1 bg-green-50 rounded-lg px-2.5 py-1.5 text-center">
              <p className="text-sm font-bold text-green-700">{report.stats.publicCount}</p>
              <p className="text-[9px] text-green-500">public</p>
            </div>
            <div className="flex-1 bg-red-50 rounded-lg px-2.5 py-1.5 text-center">
              <p className="text-sm font-bold text-red-700">{report.stats.protectedCount}</p>
              <p className="text-[9px] text-red-500">protected</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search className="h-3 w-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search routes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-xs pl-7 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:border-blue-300 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Method filter */}
        <div className="px-3 py-2 border-b border-slate-100 flex gap-1 flex-wrap">
          <button onClick={() => setFilterMethod('all')}
            className={cn('text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors',
              filterMethod === 'all' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
            ALL
          </button>
          {methods.map(m => {
            const cfg = METHOD_CONFIG[m];
            return (
              <button key={m} onClick={() => setFilterMethod(filterMethod === m ? 'all' : m)}
                className={cn('text-[9px] px-2 py-0.5 rounded-full border font-bold font-mono transition-colors',
                  filterMethod === m ? `${cfg.bg} ${cfg.color} ${cfg.border}` : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
                {m}
              </button>
            );
          })}
        </div>

        {/* Auth filter */}
        <div className="px-3 py-1.5 border-b border-slate-100 flex gap-1">
          {(['all', 'public', 'protected'] as const).map(a => (
            <button key={a} onClick={() => setFilterAuth(a)}
              className={cn('text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors capitalize',
                filterAuth === a ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
              {a}
            </button>
          ))}
        </div>

        {/* Endpoint list grouped by category */}
        <div className="flex-1 overflow-y-auto p-2 space-y-3">
          {Object.keys(grouped).length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No endpoints match filters</p>
          ) : (
            Object.entries(grouped).map(([category, endpoints]) => (
              <div key={category}>
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">
                  {category} ({endpoints.length})
                </p>
                <div className="space-y-0.5">
                  {endpoints.map(ep => (
                    <EndpointRow
                      key={ep.id}
                      endpoint={ep}
                      isSelected={selectedId === ep.id}
                      onClick={() => setSelectedId(ep.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Top bar */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <MethodBadge method={selected.method} />
                <span className="text-base font-mono font-semibold text-slate-900">{selected.path}</span>
                <AuthBadge auth={selected.auth} />
              </div>
              <p className="text-sm text-slate-500 mt-1">{selected.summary}</p>
            </div>
            <EndpointDetail endpoint={selected} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <Radio className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select an endpoint to view its contract</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
