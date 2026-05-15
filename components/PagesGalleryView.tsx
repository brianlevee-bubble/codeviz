'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import type { UIFlowGraph, UIRoute } from '@/lib/ui-flow/types';
import { isDynamicRoute } from '@/lib/ui-flow/types';
import { Globe, RefreshCw, Loader2, AlertCircle, ExternalLink, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Each card shows a page at this visual size
const CARD_W = 260;
const CARD_H = 163; // ~16:10

// The iframe renders at full desktop width then is scaled down
const IFRAME_W = 1280;
const IFRAME_H = Math.round(IFRAME_W * (CARD_H / CARD_W)); // ~800
const SCALE = CARD_W / IFRAME_W; // 0.203125

const UI_CACHE_PREFIX = 'codeviz_uiflow_v1_';
const EXAMPLE_URLS_KEY = 'codeviz_example_urls_v1_';

function getUiFlowCache(dirPath: string): UIFlowGraph | null {
  try { return JSON.parse(localStorage.getItem(UI_CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}

function getExampleUrls(dirPath: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(EXAMPLE_URLS_KEY + btoa(dirPath)) ?? '{}'); } catch { return {}; }
}

function saveExampleUrls(dirPath: string, urls: Record<string, string>) {
  try { localStorage.setItem(EXAMPLE_URLS_KEY + btoa(dirPath), JSON.stringify(urls)); } catch { /* quota */ }
}

// ── Page card ─────────────────────────────────────────────────────────────────

function PageCard({
  route,
  baseUrl,
  exampleUrl,
  onExampleUrl,
}: {
  route: UIRoute;
  baseUrl: string;
  exampleUrl?: string;
  onExampleUrl: (routeId: string, url: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [inputValue, setInputValue] = useState(exampleUrl ?? '');
  const [inputFocused, setInputFocused] = useState(false);
  const dynamic = isDynamicRoute(route.path);

  const staticUrl = !dynamic && baseUrl
    ? `${baseUrl.replace(/\/$/, '')}${route.path === '/' ? '' : route.path}`
    : '';
  const displayUrl = dynamic ? (exampleUrl ?? '') : staticUrl;

  function commitExampleUrl(val: string) {
    const trimmed = val.trim();
    if (trimmed) onExampleUrl(route.id, trimmed);
    setInputValue(trimmed);
  }

  return (
    <div
      className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Preview */}
      <div
        className="relative overflow-hidden bg-slate-100 shrink-0"
        style={{ width: CARD_W, height: CARD_H }}
      >
        {displayUrl ? (
          <div
            style={{
              transform: `scale(${SCALE})`,
              transformOrigin: 'top left',
              width: IFRAME_W,
              height: IFRAME_H,
              pointerEvents: 'none',
            }}
          >
            <iframe
              src={displayUrl}
              width={IFRAME_W}
              height={IFRAME_H}
              className="border-0"
              title={route.label}
              sandbox="allow-same-origin allow-scripts allow-forms"
            />
          </div>
        ) : dynamic ? (
          // Dynamic route — prompt for example URL
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-4">
            <Link className="h-5 w-5 text-slate-300" />
            <p className="text-[10px] text-slate-400 font-mono text-center leading-relaxed">{route.path}</p>
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => { setInputFocused(false); commitExampleUrl(inputValue); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
              placeholder="Paste example URL…"
              className="w-full text-[10px] font-mono px-2 py-1 rounded border border-slate-200 bg-white outline-none focus:border-blue-400 text-slate-600 placeholder-slate-300"
              onClick={e => e.stopPropagation()}
            />
            {!inputFocused && !inputValue && (
              <p className="text-[9px] text-slate-300">Dynamic route — needs a real URL</p>
            )}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Globe className="h-8 w-8 text-slate-200 mx-auto mb-1.5" />
              <p className="text-[10px] text-slate-300 font-mono">{route.path}</p>
            </div>
          </div>
        )}

        {/* Hover overlay — only for routable pages */}
        {hovered && displayUrl && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-white/90 hover:bg-white text-slate-800 text-[10px] font-medium px-2.5 py-1.5 rounded-lg shadow transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          </div>
        )}
      </div>

      {/* Label */}
      <div className="px-3 py-2 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-800 truncate">{route.label}</p>
        <p className="text-[10px] font-mono text-slate-400 truncate">{route.path}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PagesGalleryView() {
  const { directoryPath } = useGraphStore();

  const [uiGraph, setUiGraph] = useState<UIFlowGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [exampleUrls, setExampleUrls] = useState<Record<string, string>>({});

  const loadedForPath = useRef<string | null>(null);

  const loadGraph = useCallback(async (path: string) => {
    setExampleUrls(getExampleUrls(path));

    // Try cache first
    const cached = getUiFlowCache(path);
    if (cached) {
      setUiGraph(cached);
      if (cached.port) setBaseUrl(`http://localhost:${cached.port}`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ui-flow?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to scan routes'); return; }
      const graph = data as UIFlowGraph;
      try { localStorage.setItem(UI_CACHE_PREFIX + btoa(path), JSON.stringify(graph)); } catch { /* quota */ }
      setUiGraph(graph);
      if (graph.port) setBaseUrl(`http://localhost:${graph.port}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      loadGraph(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  const handleExampleUrl = useCallback((routeId: string, url: string) => {
    if (!directoryPath) return;
    setExampleUrls(prev => {
      const next = { ...prev, [routeId]: url };
      saveExampleUrls(directoryPath, next);
      return next;
    });
  }, [directoryPath]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Scanning routes…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500 max-w-sm text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={() => directoryPath && loadGraph(directoryPath)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!uiGraph) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus-within:border-blue-300 flex-1 max-w-xs">
          <Globe className="h-3 w-3 text-slate-400 shrink-0" />
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="http://localhost:3001"
            className="flex-1 text-xs font-mono bg-transparent outline-none text-slate-600 min-w-0"
          />
        </div>

        <Button
          size="sm" variant="ghost"
          onClick={() => directoryPath && loadGraph(directoryPath)}
          className="h-7 w-7 p-0 text-slate-400"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        <p className="text-xs text-slate-400 ml-auto">
          {uiGraph.routes.length} page{uiGraph.routes.length !== 1 ? 's' : ''}
          {uiGraph.framework !== 'unknown' && ` · ${uiGraph.framework}`}
        </p>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div
          className="grid gap-5"
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))` }}
        >
          {uiGraph.routes.map(route => (
            <PageCard
              key={route.id}
              route={route}
              baseUrl={baseUrl}
              exampleUrl={exampleUrls[route.id] ?? route.exampleUrl}
              onExampleUrl={handleExampleUrl}
            />
          ))}
        </div>
      </div>

    </div>
  );
}
