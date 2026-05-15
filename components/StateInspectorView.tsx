'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RefreshCw, Monitor, Tablet, Smartphone,
  ChevronRight, ChevronDown, Activity, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UrlState {
  href: string;
  pathname: string;
  params: Record<string, string>;
  hash: string;
}

interface HookInfo {
  t: 'state' | 'ref' | '?';
  v: unknown;
}

interface ComponentInfo {
  n: string;
  s: string | null;
  h: HookInfo[];
}

interface NetworkEntry {
  id: number;
  m: string;
  u: string;
  ts: number;
  st: number | null;
  d: number | null;
}

interface StateSnapshot {
  url: UrlState;
  components: ComponentInfo[];
  networkLog: NetworkEntry[];
}

// ─── Value tree ───────────────────────────────────────────────────────────────

function ValueNode({ val, depth = 0 }: { val: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 1);

  if (val === null || val === undefined) {
    return <span className="text-slate-400 text-[10px]">{val === null ? 'null' : 'undefined'}</span>;
  }
  const t = typeof val;
  if (t === 'string') {
    const s = val as string;
    if (s.startsWith('[') && s.endsWith(']')) {
      return <span className="text-slate-400 text-[10px] italic">{s}</span>;
    }
    return <span className="text-emerald-700 text-[10px]">"{s.length > 60 ? s.slice(0, 60) + '…' : s}"</span>;
  }
  if (t === 'number') return <span className="text-blue-600 text-[10px]">{String(val)}</span>;
  if (t === 'boolean') return <span className="text-purple-600 text-[10px]">{String(val)}</span>;
  if (Array.isArray(val)) {
    const arr = val as unknown[];
    if (arr.length === 0) return <span className="text-slate-400 text-[10px]">[]</span>;
    return (
      <span>
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-700"
        >
          {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          <span className="text-[10px] text-slate-400">Array({arr.length})</span>
        </button>
        {open && (
          <div className="ml-3 pl-2 border-l border-slate-100 space-y-0.5 mt-0.5">
            {arr.map((item, i) => (
              <div key={i} className="flex gap-1.5 items-start">
                <span className="text-slate-400 text-[9px] font-mono mt-px shrink-0">{i}</span>
                <ValueNode val={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  if (t === 'object') {
    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return <span className="text-slate-400 text-[10px]">{'{}'}</span>;
    const preview = keys.slice(0, 3).join(', ') + (keys.length > 3 ? ', …' : '');
    return (
      <span>
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-700"
        >
          {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          <span className="text-[10px] text-slate-400">{'{'}{preview}{'}'}</span>
        </button>
        {open && (
          <div className="ml-3 pl-2 border-l border-slate-100 space-y-0.5 mt-0.5">
            {keys.map(k => (
              <div key={k} className="flex gap-1.5 items-start">
                <span className="text-slate-600 text-[10px] font-mono shrink-0">{k}:</span>
                <ValueNode val={obj[k]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }
  return <span className="text-slate-600 text-[10px] italic">{String(val)}</span>;
}

// ─── Viewports ────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { label: 'Desktop' as const, Icon: Monitor,    width: null },
  { label: 'Tablet'  as const, Icon: Tablet,     width: 768  },
  { label: 'Mobile'  as const, Icon: Smartphone, width: 390  },
] as const;
type ViewportLabel = (typeof VIEWPORTS)[number]['label'];

// ─── Main component ───────────────────────────────────────────────────────────

export function StateInspectorView() {
  const iframeRef      = useRef<HTMLIFrameElement>(null);
  const currentUrlRef  = useRef('http://localhost:3000');
  const [inputUrl, setInputUrl]       = useState('http://localhost:3000');
  const [currentUrl, setCurrentUrl]   = useState('http://localhost:3000');
  const [iframeKey, setIframeKey]     = useState(0);
  const [snapshot, setSnapshot]       = useState<StateSnapshot | null>(null);
  const [loading, setLoading]         = useState(true);
  const [activePanel, setActivePanel] = useState<'state' | 'url' | 'network'>('state');
  const [viewport, setViewport]       = useState<ViewportLabel>('Desktop');
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());

  // ── Listen for postMessages from iframe ────────────────────────────────────
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'CVIZ_READY') {
        setLoading(false);
        iframeRef.current?.contentWindow?.postMessage({ type: 'CVIZ_START_STATE_WATCH' }, '*');
      }
      if (e.data.type === 'CVIZ_STATE_SNAPSHOT') {
        const { url, components, networkLog } = e.data as StateSnapshot & { type: string };
        setSnapshot({ url, components, networkLog });
      }
      if (e.data.type === 'CVIZ_NAVIGATE') {
        const targetUrl: string = e.data.url;
        if (!targetUrl) return;
        const norm = (u: string) => u.replace(/\/+$/, '');
        if (norm(targetUrl) === norm(currentUrlRef.current)) return;
        currentUrlRef.current = targetUrl;
        setCurrentUrl(targetUrl);
        setInputUrl(targetUrl);
        setSnapshot(null);
        setLoading(true);
        setIframeKey(k => k + 1);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => { currentUrlRef.current = currentUrl; }, [currentUrl]);

  function navigate(url: string) {
    const norm = url.startsWith('http') ? url : `http://localhost:3000${url.startsWith('/') ? url : '/' + url}`;
    setCurrentUrl(norm);
    setInputUrl(norm);
    setSnapshot(null);
    setLoading(true);
    setIframeKey(k => k + 1);
  }

  function toggleExpanded(key: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const proxyUrl = `/api/visual-proxy?url=${encodeURIComponent(currentUrl)}`;
  const vp       = VIEWPORTS.find(v => v.label === viewport)!;

  const stateComponents = (snapshot?.components ?? []).filter(c =>
    c.h.some(h => h.t === 'state')
  );
  const networkEntries = snapshot?.networkLog ?? [];
  const urlState       = snapshot?.url;
  const paramEntries   = urlState ? Object.entries(urlState.params) : [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">

      {/* ── Top chrome ────────────────────────────────────────────────────── */}
      <div className="h-11 bg-white border-b border-slate-200 flex items-center gap-2 px-3 shrink-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <Activity className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-xs font-semibold text-slate-700">State Inspector</span>
        </div>
        <div className="w-px h-5 bg-slate-200 shrink-0" />

        <form className="flex-1 flex items-center gap-1.5 min-w-0"
          onSubmit={e => { e.preventDefault(); navigate(inputUrl); }}>
          <input
            type="text" value={inputUrl} onChange={e => setInputUrl(e.target.value)}
            className="flex-1 min-w-0 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-300"
            placeholder="http://localhost:3000/page"
          />
          <button type="submit" title="Navigate"
            className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </form>

        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
          {VIEWPORTS.map(v => (
            <button key={v.label} onClick={() => setViewport(v.label)}
              title={`${v.label}${v.width ? ` (${v.width}px)` : ''}`}
              className={cn('p-1.5 rounded-md transition-colors',
                viewport === v.label ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
              <v.Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Iframe */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-slate-100">
          <div
            className={cn(
              'bg-white shadow-md rounded-xl overflow-hidden border border-slate-200 transition-all duration-300',
              viewport === 'Desktop' && 'w-full h-full'
            )}
            style={vp.width ? { width: vp.width, minHeight: '100%' } : { width: '100%', height: '100%' }}
          >
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={proxyUrl}
              className="w-full border-0 block"
              style={{ height: vp.width ? Math.max(600, window?.innerHeight ?? 800) : '100%', minHeight: 400 }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              onLoad={() => {
                setLoading(false);
                iframeRef.current?.contentWindow?.postMessage({ type: 'CVIZ_START_STATE_WATCH' }, '*');
              }}
            />
          </div>
        </div>

        {/* ── State panel ───────────────────────────────────────────────── */}
        <div className="w-80 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">

          {/* Panel tab bar */}
          <div className="shrink-0 flex border-b border-slate-200">
            {(['state', 'url', 'network'] as const).map(tab => (
              <button key={tab} onClick={() => setActivePanel(tab)}
                className={cn(
                  'flex-1 py-2 text-[10px] font-medium transition-colors relative',
                  activePanel === tab
                    ? 'text-blue-600 border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-slate-600'
                )}
              >
                {tab === 'state' ? 'React State' : tab === 'url' ? 'URL' : 'Network'}
                {tab === 'network' && networkEntries.length > 0 && (
                  <span className="ml-1 text-[9px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded-full">
                    {networkEntries.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Live indicator */}
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
            {loading ? (
              <>
                <Loader2 className="h-2.5 w-2.5 text-slate-400 animate-spin" />
                <span className="text-[9px] text-slate-400">Loading…</span>
              </>
            ) : snapshot ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="text-[9px] text-slate-400">
                  Live · {stateComponents.length} stateful
                  {snapshot.components.length !== stateComponents.length && (
                    <> / {snapshot.components.length} total</>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300 shrink-0" />
                <span className="text-[9px] text-slate-400">Waiting for page…</span>
              </>
            )}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">

            {/* ── React State tab ───────────────────────────────────────── */}
            {activePanel === 'state' && (
              <div>
                {!snapshot && (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <Activity className="h-8 w-8 text-slate-200 mb-3" />
                    <p className="text-xs text-slate-400 font-medium">No data yet</p>
                    <p className="text-[10px] text-slate-300 mt-1">Load a page to inspect state</p>
                  </div>
                )}
                {snapshot && stateComponents.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <p className="text-xs text-slate-400 font-medium">No stateful components found</p>
                    <p className="text-[10px] text-slate-300 mt-1 leading-relaxed">
                      {snapshot.components.length > 0
                        ? `Found ${snapshot.components.length} component${snapshot.components.length !== 1 ? 's' : ''} but none have detectable useState hooks.`
                        : 'No React components detected. Make sure the target app is running.'}
                    </p>
                  </div>
                )}
                {stateComponents.map((comp, ci) => {
                  const key = `${comp.n}-${ci}`;
                  const isOpen = expanded.has(key);
                  const stateHooks = comp.h.filter(h => h.t === 'state');
                  return (
                    <div key={ci} className="border-b border-slate-50 last:border-b-0">
                      <button
                        onClick={() => toggleExpanded(key)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left"
                      >
                        {isOpen
                          ? <ChevronDown  className="h-3 w-3 text-slate-300 shrink-0" />
                          : <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-medium text-slate-700 truncate block">{comp.n}</span>
                          {comp.s && (
                            <span className="text-[9px] text-slate-400 font-mono truncate block">{comp.s}</span>
                          )}
                        </div>
                        <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full font-semibold shrink-0">
                          {stateHooks.length}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-3 pb-3 space-y-2">
                          {stateHooks.map((hook, hi) => (
                            <div key={hi} className="bg-slate-50 rounded-lg p-2.5">
                              <p className="text-[9px] font-semibold text-blue-500 uppercase tracking-wider mb-1.5">
                                state[{hi}]
                              </p>
                              <ValueNode val={hook.v} depth={0} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── URL tab ───────────────────────────────────────────────── */}
            {activePanel === 'url' && (
              <div className="p-3 space-y-4">
                {!urlState ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-xs text-slate-400">Load a page to see URL state</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Pathname</p>
                      <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                        <p className="text-[11px] font-mono text-blue-700 break-all">{urlState.pathname || '/'}</p>
                        {urlState.hash && (
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{urlState.hash}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                        Query Params
                        {paramEntries.length > 0 && (
                          <span className="ml-1 text-slate-300 font-normal">({paramEntries.length})</span>
                        )}
                      </p>
                      {paramEntries.length === 0 ? (
                        <p className="text-[10px] text-slate-300 italic px-1">None</p>
                      ) : (
                        <div className="bg-slate-50 rounded-lg overflow-hidden divide-y divide-slate-100">
                          {paramEntries.map(([k, v]) => (
                            <div key={k} className="flex items-start gap-2 px-2.5 py-1.5">
                              <span className="text-[10px] font-mono font-semibold text-slate-600 shrink-0 min-w-[70px]">{k}</span>
                              <span className="text-[10px] font-mono text-emerald-700 break-all">{v}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Full URL</p>
                      <div className="bg-slate-50 rounded-lg px-2.5 py-2">
                        <p className="text-[9px] font-mono text-slate-500 break-all leading-relaxed">{urlState.href}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Network tab ───────────────────────────────────────────── */}
            {activePanel === 'network' && (
              <div>
                {networkEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                    <p className="text-xs text-slate-400 font-medium">No requests yet</p>
                    <p className="text-[10px] text-slate-300 mt-1 leading-relaxed">
                      Interact with the page to see network activity
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {[...networkEntries].reverse().map(entry => {
                      const isOk  = entry.st !== null && entry.st >= 200 && entry.st < 400;
                      const isErr = entry.st !== null && (entry.st === 0 || entry.st >= 400);
                      let shortUrl = entry.u;
                      try { const u = new URL(entry.u, 'http://x'); shortUrl = u.pathname + (u.search || ''); } catch { /* ignore */ }
                      return (
                        <div key={entry.id} className="px-3 py-2 flex items-start gap-2">
                          <span className={cn(
                            'text-[9px] font-bold font-mono shrink-0 mt-px w-11 text-center rounded px-1 py-0.5',
                            entry.m === 'GET'                      ? 'text-blue-600 bg-blue-50'    :
                            entry.m === 'POST'                     ? 'text-emerald-600 bg-emerald-50' :
                            entry.m === 'PUT' || entry.m === 'PATCH' ? 'text-amber-600 bg-amber-50'   :
                            entry.m === 'DELETE'                   ? 'text-red-600 bg-red-50'      :
                            'text-slate-500 bg-slate-100'
                          )}>
                            {entry.m}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-mono text-slate-700 truncate">{shortUrl}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {entry.st !== null ? (
                                <span className={cn(
                                  'text-[9px] font-semibold',
                                  isOk ? 'text-emerald-600' : isErr ? 'text-red-500' : 'text-slate-400'
                                )}>
                                  {entry.st === 0 ? 'ERR' : entry.st}
                                </span>
                              ) : (
                                <span className="text-[9px] text-slate-300 flex items-center gap-0.5">
                                  <Loader2 className="h-2 w-2 animate-spin" />pending
                                </span>
                              )}
                              {entry.d !== null && (
                                <span className="text-[9px] text-slate-400">{entry.d}ms</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
