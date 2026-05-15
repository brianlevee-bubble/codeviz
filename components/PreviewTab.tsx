'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import type { UIFlowGraph, UIRoute } from '@/lib/ui-flow/types';
import {
  Loader2, AlertCircle, RefreshCw, Camera, CheckCircle2,
  XCircle, RotateCcw, ExternalLink, ChevronRight, Monitor,
  Smartphone, Tablet, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Viewport presets ─────────────────────────────────────────────────────────

const VIEWPORTS = [
  { label: 'Desktop', icon: Monitor,    width: '100%',  height: '100%' },
  { label: 'Tablet',  icon: Tablet,     width: '768px', height: '1024px' },
  { label: 'Mobile',  icon: Smartphone, width: '390px', height: '844px' },
] as const;

type ViewportLabel = (typeof VIEWPORTS)[number]['label'];

// ─── Route sidebar item ───────────────────────────────────────────────────────

function RouteItem({
  route,
  active,
  capturing,
  captured,
  failed,
  onClick,
}: {
  route: UIRoute;
  active: boolean;
  capturing: boolean;
  captured: boolean;
  failed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors rounded-lg group',
        active ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
      )}
    >
      {/* Status dot */}
      <span className="shrink-0">
        {capturing && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
        {!capturing && captured && <CheckCircle2 className="h-3 w-3 text-green-500" />}
        {!capturing && failed && <XCircle className="h-3 w-3 text-red-400" />}
        {!capturing && !captured && !failed && (
          <span className={cn(
            'block h-2 w-2 rounded-full mt-0.5 ml-0.5',
            active ? 'bg-blue-400' : 'bg-slate-300'
          )} />
        )}
      </span>

      <div className="flex-1 min-w-0">
        <p className={cn('text-xs font-medium truncate', active ? 'text-blue-700' : 'text-slate-800')}>
          {route.label}
        </p>
        <p className={cn('text-[10px] font-mono truncate', active ? 'text-blue-500' : 'text-slate-400')}>
          {route.path}
        </p>
      </div>

      {route.screenshotUrl && !capturing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={route.screenshotUrl}
          alt=""
          className="h-7 w-10 object-cover object-top rounded border border-slate-200 shrink-0 opacity-80 group-hover:opacity-100"
        />
      )}

      {active && !route.screenshotUrl && !capturing && (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-blue-400" />
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PreviewTab() {
  const { directoryPath } = useGraphStore();

  const [uiGraph, setUiGraph] = useState<UIFlowGraph | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const [selectedRoute, setSelectedRoute] = useState<UIRoute | null>(null);
  const [baseUrl, setBaseUrl] = useState('http://localhost:3001');
  const [editingUrl, setEditingUrl] = useState('');
  const [iframeKey, setIframeKey] = useState(0); // increment to force reload
  const [iframeLoading, setIframeLoading] = useState(false);
  const [viewport, setViewport] = useState<ViewportLabel>('Desktop');

  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [captureStatuses, setCaptureStatuses] = useState<Record<string, 'done' | 'error'>>({});
  const [captureAllRunning, setCaptureAllRunning] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedForPath = useRef<string | null>(null);
  const urlBarRef = useRef<HTMLInputElement>(null);

  // ── Load route graph ────────────────────────────────────────────────────────

  const loadGraph = useCallback(async (path: string) => {
    setLoadingGraph(true);
    setGraphError(null);
    try {
      const res = await fetch(`/api/ui-flow?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) { setGraphError(data.error ?? 'Failed to scan routes'); return; }
      const graph = data as UIFlowGraph;
      setUiGraph(graph);
      const detectedBase = graph.port ? `http://localhost:${graph.port}` : 'http://localhost:3001';
      setBaseUrl(detectedBase);
      if (graph.routes.length > 0) {
        setSelectedRoute(graph.routes[0]);
        setEditingUrl(detectedBase + (graph.routes[0].path === '/' ? '' : graph.routes[0].path));
      }
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      loadGraph(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  // ── Route selection ─────────────────────────────────────────────────────────

  const selectRoute = useCallback((route: UIRoute) => {
    setSelectedRoute(route);
    const url = baseUrl + (route.path === '/' ? '' : route.path);
    setEditingUrl(url);
    // Don't auto-load dynamic routes — user needs to replace params with real values
    if (!/\/:/.test(route.path)) {
      setIframeKey(k => k + 1);
      setIframeLoading(true);
    }
  }, [baseUrl]);

  // ── Navigate URL bar ────────────────────────────────────────────────────────

  function navigateToUrl(url: string) {
    setEditingUrl(url);
    setIframeKey(k => k + 1);
    setIframeLoading(true);
  }

  // ── Capture one route ────────────────────────────────────────────────────────

  const captureRoute = useCallback(async (route: UIRoute, overrideBaseUrl?: string) => {
    if (!directoryPath) return;
    const base = (overrideBaseUrl ?? baseUrl).replace(/\/$/, '');
    if (!base) return;

    setCapturingId(route.id);
    try {
      const url = `${base}${route.path === '/' ? '' : route.path}`;
      const res = await fetch('/api/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, routeId: route.id, projectPath: directoryPath }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      // Update screenshotUrl on the route
      setUiGraph(prev => {
        if (!prev) return prev;
        return { ...prev, routes: prev.routes.map(r => r.id === route.id ? { ...r, screenshotUrl: data.url } : r) };
      });
      setCaptureStatuses(p => ({ ...p, [route.id]: 'done' }));
    } catch {
      setCaptureStatuses(p => ({ ...p, [route.id]: 'error' }));
    } finally {
      setCapturingId(null);
    }
  }, [directoryPath, baseUrl]);

  // ── Capture all routes ────────────────────────────────────────────────────

  const captureAll = useCallback(async () => {
    if (!uiGraph || !directoryPath || !baseUrl) return;
    setCaptureAllRunning(true);
    for (const route of uiGraph.routes) {
      await captureRoute(route, baseUrl);
    }
    setCaptureAllRunning(false);
  }, [uiGraph, directoryPath, baseUrl, captureRoute]);

  // ── Active iframe URL ────────────────────────────────────────────────────────

  const activeIframeUrl = editingUrl || (
    selectedRoute && baseUrl
      ? baseUrl + (selectedRoute.path === '/' ? '' : selectedRoute.path)
      : ''
  );

  const vp = VIEWPORTS.find(v => v.label === viewport) ?? VIEWPORTS[0];

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loadingGraph) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Scanning routes…</span>
        </div>
      </div>
    );
  }

  if (graphError) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500 max-w-sm text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm">{graphError}</p>
          <Button variant="outline" size="sm" onClick={() => directoryPath && loadGraph(directoryPath)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!uiGraph) return null;

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── Route sidebar ────────────────────────────────────────────────── */}
      <div className="w-56 shrink-0 border-r border-slate-200 flex flex-col bg-white">
        {/* Sidebar header */}
        <div className="px-3 py-2.5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-800">Routes</p>
            <p className="text-[10px] text-slate-400">
              {uiGraph.routes.length} page{uiGraph.routes.length !== 1 ? 's' : ''}
              {uiGraph.framework !== 'unknown' && ` · ${uiGraph.framework}`}
            </p>
          </div>
          <Button
            size="sm" variant="ghost"
            onClick={() => directoryPath && loadGraph(directoryPath)}
            className="h-6 w-6 p-0 text-slate-400"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {/* Base URL field */}
        <div className="px-2 py-2 border-b border-slate-100">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <Globe className="h-3 w-3 text-slate-400 shrink-0" />
            <input
              type="text"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && selectedRoute) selectRoute(selectedRoute);
              }}
              placeholder="http://localhost:3001"
              className="flex-1 text-[10px] font-mono bg-transparent outline-none text-slate-600 min-w-0"
            />
          </div>
        </div>

        {/* Capture all */}
        <div className="px-2 py-2 border-b border-slate-100">
          <Button
            size="sm"
            variant="outline"
            onClick={captureAll}
            disabled={captureAllRunning || !baseUrl || capturingId !== null}
            className="w-full h-6 text-[10px] gap-1"
          >
            {captureAllRunning
              ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Capturing…</>
              : <><Camera className="h-2.5 w-2.5" /> Capture All</>
            }
          </Button>
        </div>

        {/* Route list */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {uiGraph.routes.map(route => (
            <RouteItem
              key={route.id}
              route={route}
              active={selectedRoute?.id === route.id}
              capturing={capturingId === route.id}
              captured={captureStatuses[route.id] === 'done' || !!route.screenshotUrl}
              failed={captureStatuses[route.id] === 'error'}
              onClick={() => selectRoute(route)}
            />
          ))}
        </div>
      </div>

      {/* ── Preview pane ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">

        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 shrink-0">
          {/* Nav buttons */}
          <button
            onClick={() => setIframeKey(k => k + 1)}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            title="Reload"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* URL bar */}
          <form
            className="flex-1 flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 focus-within:border-blue-300 focus-within:ring-1 focus-within:ring-blue-100"
            onSubmit={e => { e.preventDefault(); navigateToUrl(editingUrl); }}
          >
            <Globe className="h-3 w-3 text-slate-400 shrink-0" />
            <input
              ref={urlBarRef}
              type="text"
              value={editingUrl}
              onChange={e => setEditingUrl(e.target.value)}
              className="flex-1 text-xs font-mono bg-transparent outline-none text-slate-700"
              placeholder="http://localhost:3001"
              onFocus={e => e.target.select()}
            />
            {iframeLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400 shrink-0" />}
          </form>

          {/* Open in new tab */}
          {activeIframeUrl && (
            <a
              href={activeIframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              title="Open in browser"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {/* Viewport switcher */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {VIEWPORTS.map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => setViewport(label)}
                title={label}
                className={cn(
                  'p-1 rounded transition-all',
                  viewport === label
                    ? 'bg-white shadow-sm text-slate-700'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          {/* Capture current */}
          <Button
            size="sm" variant="outline"
            onClick={() => selectedRoute && captureRoute(selectedRoute)}
            disabled={capturingId !== null || !baseUrl || !selectedRoute}
            className="h-7 px-2.5 text-xs gap-1.5"
          >
            {capturingId === selectedRoute?.id
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Camera className="h-3 w-3" />
            }
            Capture
          </Button>
        </div>

        {/* iframe container */}
        <div className="flex-1 flex items-start justify-center overflow-auto bg-slate-200 p-4">
          {!activeIframeUrl ? (
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <Globe className="h-10 w-10 opacity-40" />
                <p className="text-sm">Enter a URL or select a route</p>
                {!baseUrl && (
                  <p className="text-xs text-slate-400 max-w-xs text-center">
                    Set the base URL on the left (e.g. <code className="bg-slate-100 px-1 rounded">http://localhost:3001</code>) to start previewing
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div
              className="bg-white shadow-xl rounded-lg overflow-hidden shrink-0 transition-all duration-300"
              style={{
                width: vp.width,
                height: vp.height,
                maxWidth: '100%',
              }}
            >
              <iframe
                ref={iframeRef}
                key={iframeKey}
                src={activeIframeUrl}
                className="w-full h-full border-0"
                onLoad={() => setIframeLoading(false)}
                onError={() => setIframeLoading(false)}
                title="Page preview"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
