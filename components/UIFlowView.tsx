'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useGraphStore } from '@/lib/store/graph-store';
import { PageScreenshotNode } from '@/components/canvas/nodes/PageScreenshotNode';
import type { UIFlowGraph, UIRoute, UINavEdge } from '@/lib/ui-flow/types';
import { isDynamicRoute } from '@/lib/ui-flow/types';
import type { DataList, QueriesGraph } from '@/lib/queries/types';
import { Camera, Loader2, RefreshCw, AlertCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp, KeyRound, X, FileCode, Filter, ArrowUpDown, Table2, Send, EyeOff, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NODE_TYPES: NodeTypes = {
  pageScreenshot: PageScreenshotNode,
};

const NODE_WIDTH = 192;
const NODE_HEIGHT_BASE = 160;
const QUERY_SECTION_HEADER = 28;
const QUERY_ROW_HEIGHT = 20;

function nodeHeight(listCount: number) {
  if (listCount === 0) return NODE_HEIGHT_BASE;
  return NODE_HEIGHT_BASE + QUERY_SECTION_HEADER + listCount * QUERY_ROW_HEIGHT;
}

// Route prefix → accent color
const ACCENT_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16'];
function buildColorMap(routes: UIRoute[]): Map<string, string> {
  const prefixes = new Map<string, number>();
  routes.forEach(r => {
    const prefix = '/' + (r.path.split('/').filter(Boolean)[0] ?? '');
    if (!prefixes.has(prefix)) prefixes.set(prefix, prefixes.size);
  });
  const map = new Map<string, string>();
  routes.forEach(r => {
    const prefix = '/' + (r.path.split('/').filter(Boolean)[0] ?? '');
    const idx = prefixes.get(prefix) ?? 0;
    map.set(r.id, ACCENT_COLORS[idx % ACCENT_COLORS.length]);
  });
  return map;
}

// Normalise a route path so dynamic segments all collapse to "*".
// Handles :id, [id], {id}, [...slug], [[...slug]], etc.
function normalizeRoute(p: string): string {
  return p
    .split('/')
    .map(seg => /^[:[{]|^\*/.test(seg) ? '*' : seg)
    .join('/');
}

const QUERIES_CACHE_PREFIX = 'codeviz_queries_v1_';
const UI_FLOW_CACHE_PREFIX = 'codeviz_uiflow_v1_';
function loadQueriesCache(dirPath: string): Map<string, DataList[]> {
  const map = new Map<string, DataList[]>();
  try {
    const raw = localStorage.getItem(QUERIES_CACHE_PREFIX + btoa(dirPath));
    if (!raw) return map;
    const graph = JSON.parse(raw) as QueriesGraph;
    for (const page of graph.pages) {
      if (page.lists.length > 0) {
        // Index by both the original route and its normalised form so either can match
        map.set(page.route, page.lists);
        map.set(normalizeRoute(page.route), page.lists);
      }
    }
  } catch { /* ignore */ }
  return map;
}

function lookupLists(queriesMap: Map<string, DataList[]>, routePath: string): DataList[] {
  return queriesMap.get(routePath) ?? queriesMap.get(normalizeRoute(routePath)) ?? [];
}

// ─── Detail panel ────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function ListDetailPanel({
  list, routePath, directoryPath, onClose,
}: { list: DataList; routePath: string; directoryPath: string; onClose: () => void }) {
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(async () => {
    const instruction = chatInput.trim();
    if (!instruction || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: instruction };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch('/api/edit-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directoryPath,
          file: list.file,
          queryCode: list.query,
          instruction,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setChatError(data.error ?? `HTTP ${res.status}`);
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error ?? 'Failed to apply change'}` }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Done. Updated ${list.file}.` }]);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setChatError(msg);
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, directoryPath, list.file, list.query]);

  // Scroll to bottom when messages change
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  return (
    <div className="w-80 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{list.name}</p>
          <p className="text-[10px] text-slate-400 font-mono truncate">{routePath}</p>
        </div>
        <button onClick={onClose} className="ml-2 shrink-0 text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-xs text-slate-600 leading-relaxed">{list.description}</p>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <FileCode className="h-3 w-3 shrink-0" />
            <span className="font-mono truncate">{list.file}</span>
          </div>
          {list.sort && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <ArrowUpDown className="h-3 w-3 shrink-0" />
              <span>{list.sort}</span>
            </div>
          )}
          {list.limit && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span className="font-medium">Limit:</span>
              <span>{list.limit} rows</span>
              {list.isPaginated && <span className="text-blue-500">(paginated)</span>}
            </div>
          )}
        </div>

        {list.filters.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Filter className="h-3 w-3" /> Filters
            </p>
            {list.filters.map((f, i) => (
              <div key={i} className="text-[10px] bg-slate-50 text-slate-600 px-2 py-1 rounded border border-slate-100">
                {f}
              </div>
            ))}
          </div>
        )}

        {list.tables.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Table2 className="h-3 w-3" /> Tables / Models
            </p>
            <div className="flex flex-wrap gap-1">
              {list.tables.map((t, i) => (
                <span key={i} className="text-[10px] bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Query</p>
          <pre className="text-[10px] font-mono text-slate-700 bg-slate-950/[0.04] rounded-xl p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all border border-slate-100">
            <code>{list.query}</code>
          </pre>
        </div>

        {/* Chat history */}
        {chatMessages.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Changes</p>
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'text-[11px] rounded-lg px-3 py-2 leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-blue-50 text-blue-800 border border-blue-100 ml-4'
                    : msg.content.startsWith('Error:')
                    ? 'bg-red-50 text-red-700 border border-red-100'
                    : 'bg-green-50 text-green-700 border border-green-100'
                )}
              >
                {msg.content}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Chat input */}
      <div className="border-t border-slate-100 p-3 space-y-2">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Edit this query</p>
        {chatError && (
          <p className="text-[10px] text-red-500">{chatError}</p>
        )}
        <div className="flex gap-2">
          <textarea
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Describe the change… (Enter to send)"
            rows={2}
            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none placeholder:text-slate-300"
            disabled={chatLoading}
          />
          <button
            onClick={handleSend}
            disabled={!chatInput.trim() || chatLoading}
            className="shrink-0 self-end h-8 w-8 flex items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {chatLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

interface LayoutOptions {
  queriesMap: Map<string, DataList[]>;
  onListClick: (list: DataList, routePath: string) => void;
  colorMap: Map<string, string>;
  hideBackEdges: boolean;
  focusNodeId: string | null;
}

function applyLayout(routes: UIRoute[], edges: UINavEdge[], opts: LayoutOptions): { nodes: Node[]; rfEdges: Edge[] } {
  const { queriesMap, onListClick, colorMap, hideBackEdges, focusNodeId } = opts;

  // Filter edges
  const visibleEdges = edges.filter(e => {
    if (hideBackEdges && e.label && /back/i.test(e.label)) return false;
    return true;
  });

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 120 });

  for (const route of routes) {
    const lists = lookupLists(queriesMap, route.path);
    g.setNode(route.id, { width: NODE_WIDTH, height: nodeHeight(lists.length) });
  }
  for (const edge of visibleEdges) {
    g.setEdge(edge.source, edge.target);
  }
  dagre.layout(g);

  // Compute focus-connected IDs
  const connectedIds = focusNodeId
    ? new Set([
        focusNodeId,
        ...visibleEdges.filter(e => e.source === focusNodeId || e.target === focusNodeId)
          .flatMap(e => [e.source, e.target]),
      ])
    : null;

  const nodes: Node[] = routes.map((route) => {
    const pos = g.node(route.id);
    const lists = lookupLists(queriesMap, route.path);
    const h = nodeHeight(lists.length);
    const dimmed = connectedIds ? !connectedIds.has(route.id) : false;
    return {
      id: route.id,
      type: 'pageScreenshot',
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - h / 2 },
      data: {
        route,
        lists: lists.length > 0 ? lists : undefined,
        onListClick: lists.length > 0 ? (list: DataList) => onListClick(list, route.path) : undefined,
        accentColor: colorMap.get(route.id),
        dimmed,
      },
    };
  });

  const rfEdges: Edge[] = visibleEdges.map((edge) => {
    const dimmed = connectedIds
      ? !connectedIds.has(edge.source) || !connectedIds.has(edge.target)
      : false;
    const baseColor = edge.navType === 'redirect' ? '#f59e0b' : edge.navType === 'push' ? '#3b82f6' : '#94a3b8';
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: edge.navType === 'redirect',
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: dimmed ? '#e2e8f0' : baseColor },
      style: {
        stroke: dimmed ? '#e2e8f0' : baseColor,
        strokeWidth: dimmed ? 1 : 1.5,
        opacity: dimmed ? 0.2 : 1,
      },
      labelStyle: { fontSize: 10, fill: dimmed ? '#cbd5e1' : '#64748b' },
      labelBgStyle: { fill: 'white', opacity: 0.85 },
    };
  });

  return { nodes, rfEdges };
}

type RouteStatus = 'idle' | 'capturing' | 'done' | 'error';

interface RouteCapture {
  routeId: string;
  status: RouteStatus;
  error?: string;
}

export function UIFlowView() {
  const { directoryPath } = useGraphStore();
  const [uiGraph, setUiGraph] = useState<UIFlowGraph | null>(null);
  const [queriesMap, setQueriesMap] = useState<Map<string, DataList[]>>(new Map());
  const [selectedList, setSelectedList] = useState<{ list: DataList; routePath: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Screenshot state
  const [isCapturing, setIsCapturing] = useState(false);
  const [routeCaptures, setRouteCaptures] = useState<Record<string, RouteCapture>>({});
  const [baseUrl, setBaseUrl] = useState('http://localhost:3001');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showCaptureLog, setShowCaptureLog] = useState(false);

  // Auth state
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthInput, setShowAuthInput] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // View filter state
  const [hideBackEdges, setHideBackEdges] = useState(true);
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const colorMapRef = useRef<Map<string, string>>(new Map());

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const loadedForPath = useRef<string | null>(null);

  const handleListClick = useCallback((list: DataList, routePath: string) => {
    setSelectedList({ list, routePath });
  }, []);

  const refreshNodes = useCallback((
    routes: UIRoute[],
    navEdges: UINavEdge[],
    qMap: Map<string, DataList[]>,
    opts?: { hideBack?: boolean; focus?: string | null }
  ) => {
    const { nodes: n, rfEdges: e } = applyLayout(routes, navEdges, {
      queriesMap: qMap,
      onListClick: handleListClick,
      colorMap: colorMapRef.current,
      hideBackEdges: opts?.hideBack ?? hideBackEdges,
      focusNodeId: opts?.focus !== undefined ? opts.focus : focusNodeId,
    });
    setNodes(n);
    setEdges(e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNodes, setEdges, handleListClick, hideBackEdges, focusNodeId]);

  const fetchAndCacheQueries = useCallback(async (path: string): Promise<Map<string, DataList[]>> => {
    const existing = loadQueriesCache(path);
    if (existing.size > 0) return existing;

    try {
      const res = await fetch(`/api/queries?path=${encodeURIComponent(path)}`);
      if (!res.ok || !res.body) return existing;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.phase === 'complete') {
              const g = ev.graph as QueriesGraph;
              try { localStorage.setItem(QUERIES_CACHE_PREFIX + btoa(path), JSON.stringify(g)); } catch { /* quota */ }
              return loadQueriesCache(path);
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* ignore */ }
    return existing;
  }, []);

  const loadFlow = useCallback(async (path: string, force = false) => {
    setLoading(true);
    setError(null);
    setRouteCaptures({});
    setFocusNodeId(null);
    try {
      let graph: UIFlowGraph;
      if (!force) {
        try {
          const cached = localStorage.getItem(UI_FLOW_CACHE_PREFIX + btoa(path));
          if (cached) {
            graph = JSON.parse(cached) as UIFlowGraph;
            colorMapRef.current = buildColorMap(graph.routes);
            setUiGraph(graph);
            if (!baseUrl) setBaseUrl(`http://localhost:${graph.port ?? 3001}`);
            const qMap = await fetchAndCacheQueries(path);
            setQueriesMap(qMap);
            refreshNodes(graph.routes, graph.edges, qMap, { focus: null });
            return;
          }
        } catch { /* ignore, fall through to fetch */ }
      }
      const res = await fetch(`/api/ui-flow?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to load UI flow'); return; }
      graph = data as UIFlowGraph;
      try { localStorage.setItem(UI_FLOW_CACHE_PREFIX + btoa(path), JSON.stringify(graph)); } catch { /* quota */ }
      colorMapRef.current = buildColorMap(graph.routes);
      setUiGraph(graph);
      if (!baseUrl) setBaseUrl(`http://localhost:${graph.port ?? 3001}`);
      const qMap = await fetchAndCacheQueries(path);
      setQueriesMap(qMap);
      refreshNodes(graph.routes, graph.edges, qMap, { focus: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [refreshNodes, fetchAndCacheQueries]);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      loadFlow(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  // Re-layout when filters change
  useEffect(() => {
    if (uiGraph && queriesMap) {
      refreshNodes(uiGraph.routes, uiGraph.edges, queriesMap);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideBackEdges, focusNodeId]);

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    setFocusNodeId(prev => prev === node.id ? null : node.id);
  }, []);

  const handlePaneClick = useCallback(() => {
    setFocusNodeId(null);
  }, []);

  const captureScreenshots = useCallback(async () => {
    if (!uiGraph || !directoryPath) return;

    const url = baseUrl.trim().replace(/\/$/, '');
    if (!url) {
      setShowUrlInput(true);
      return;
    }

    setIsCapturing(true);
    setShowCaptureLog(true);
    setAuthError(null);
    const initialCaptures: Record<string, RouteCapture> = {};
    for (const r of uiGraph.routes) initialCaptures[r.id] = { routeId: r.id, status: 'idle' };
    setRouteCaptures(initialCaptures);

    const routes = uiGraph.routes
      .filter(r => !isDynamicRoute(r.path) || !!r.exampleUrl)
      .map(r => ({
        routeId: r.id,
        url: isDynamicRoute(r.path) && r.exampleUrl
          ? r.exampleUrl
          : `${url}${r.path === '/' ? '' : r.path}`,
      }));

    const auth = authUsername.trim() && authPassword
      ? { baseUrl: url, username: authUsername.trim(), password: authPassword }
      : undefined;

    try {
      const res = await fetch('/api/screenshot/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes, projectPath: directoryPath, auth }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setAuthError(data.error ?? `HTTP ${res.status}`);
        setIsCapturing(false);
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
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'auth_error') {
              setAuthError(msg.error);
              setIsCapturing(false);
              return;
            } else if (msg.type === 'fatal') {
              setAuthError(msg.error);
            } else if (msg.type === 'done') {
              setRouteCaptures(prev => ({ ...prev, [msg.routeId]: { routeId: msg.routeId, status: 'done' } }));
              setUiGraph(prev => {
                if (!prev) return prev;
                const newRoutes = prev.routes.map(r => r.id === msg.routeId ? { ...r, screenshotUrl: msg.url } : r);
                refreshNodes(newRoutes, prev.edges, queriesMap);
                return { ...prev, routes: newRoutes };
              });
            } else if (msg.type === 'error') {
              setRouteCaptures(prev => ({ ...prev, [msg.routeId]: { routeId: msg.routeId, status: 'error', error: msg.error } }));
            }
          } catch {
            // malformed line, skip
          }
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Request failed');
    }

    setIsCapturing(false);
  }, [uiGraph, directoryPath, baseUrl, authUsername, authPassword, refreshNodes, queriesMap]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Scanning routes...</span>
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
          <Button variant="outline" size="sm" onClick={() => directoryPath && loadFlow(directoryPath, true)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!uiGraph) return null;

  const captureList = Object.values(routeCaptures);
  const doneCount = captureList.filter(c => c.status === 'done').length;
  const errCount = captureList.filter(c => c.status === 'error').length;
  const hasScreenshots = uiGraph.routes.some(r => r.screenshotUrl);

  return (
    <div className="flex-1 flex overflow-hidden">
    <div className="flex-1 relative overflow-hidden">

      {/* ── Top-right toolbar ──────────────────────────────────────────── */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">

        {/* Stats + controls row */}
        <div className="flex items-center gap-2">
          <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 shadow-sm">
            {uiGraph.routes.length} routes · {uiGraph.edges.length} connections
            {uiGraph.framework !== 'unknown' && (
              <span className="ml-2 text-blue-500 font-medium">{uiGraph.framework}</span>
            )}
            {uiGraph.port
              ? <button onClick={() => setShowUrlInput(v => !v)} className="ml-2 text-green-500 font-medium hover:underline cursor-pointer">:{uiGraph.port}</button>
              : <span className="ml-2 text-amber-500">no port detected</span>
            }
          </div>

          <Button
            size="sm" variant="outline"
            onClick={() => directoryPath && loadFlow(directoryPath, true)}
            className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>

          <Button
            size="sm" variant="outline"
            onClick={() => setShowAuthInput(v => !v)}
            className={cn(
              'h-7 px-2 text-xs bg-white/90 backdrop-blur',
              (authUsername || authPassword) && 'border-blue-400 text-blue-600'
            )}
            title="Set login credentials"
          >
            <KeyRound className="h-3 w-3 mr-1" />
            {authUsername ? authUsername : 'Auth'}
          </Button>

          <Button
            size="sm" variant="outline"
            onClick={() => {
              if (!baseUrl) { setShowUrlInput(true); return; }
              captureScreenshots();
            }}
            disabled={isCapturing}
            className="h-7 px-3 text-xs bg-white/90 backdrop-blur border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            {isCapturing ? (
              <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />{doneCount + errCount}/{uiGraph.routes.length}</>
            ) : (
              <><Camera className="h-3 w-3 mr-1.5" />{hasScreenshots ? 'Re-capture' : 'Capture Screenshots'}</>
            )}
          </Button>
        </div>

        {/* URL input — shown when port wasn't auto-detected or user clicks to change */}
        {(showUrlInput || !uiGraph.port) && (
          <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg p-3 w-72">
            <p className="text-xs font-medium text-slate-700 mb-1.5">
              {uiGraph.port ? 'Override base URL' : 'Enter the app\'s dev server URL'}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setShowUrlInput(false); captureScreenshots(); }
                  if (e.key === 'Escape') setShowUrlInput(false);
                }}
                placeholder="http://localhost:3001"
                className="flex-1 text-xs font-mono border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => { setShowUrlInput(false); captureScreenshots(); }}
                disabled={!baseUrl.trim()}
                className="h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white"
              >
                Go
              </Button>
            </div>
            {!uiGraph.port && (
              <p className="text-[10px] text-slate-400 mt-1.5">
                Start your dev server first, then enter its URL here.
              </p>
            )}
          </div>
        )}

        {/* Auth credentials panel */}
        {showAuthInput && (
          <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg p-3 w-72">
            <p className="text-xs font-medium text-slate-700 mb-2">Sign-in credentials</p>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={authUsername}
                onChange={e => setAuthUsername(e.target.value)}
                placeholder="Username or email"
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
              />
              <input
                type="password"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                placeholder="Password"
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                onKeyDown={e => { if (e.key === 'Enter') setShowAuthInput(false); }}
              />
              <div className="flex justify-between items-center">
                <button
                  onClick={() => { setAuthUsername(''); setAuthPassword(''); setShowAuthInput(false); }}
                  className="text-[10px] text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
                <Button
                  size="sm"
                  onClick={() => setShowAuthInput(false)}
                  className="h-6 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Save
                </Button>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Puppeteer will sign in before capturing screenshots.
            </p>
          </div>
        )}

        {/* Auth error */}
        {authError && (
          <div className="bg-red-50 border border-red-200 rounded-xl shadow-lg p-3 w-72 flex items-start gap-2">
            <XCircle className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-red-700">Login failed</p>
              <p className="text-[10px] text-red-500 mt-0.5">{authError}</p>
            </div>
          </div>
        )}

        {/* Capture log */}
        {captureList.length > 0 && (
          <div className="bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg w-72 overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setShowCaptureLog(v => !v)}
            >
              <span className="flex items-center gap-2">
                {isCapturing && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                {!isCapturing && errCount === 0 && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                {!isCapturing && errCount > 0 && <XCircle className="h-3 w-3 text-red-400" />}
                {isCapturing
                  ? `Capturing… ${doneCount + errCount}/${captureList.length}`
                  : `${doneCount} captured${errCount > 0 ? `, ${errCount} failed` : ''}`
                }
              </span>
              {showCaptureLog ? <ChevronUp className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
            </button>

            {showCaptureLog && (
              <div className="border-t border-slate-100 max-h-48 overflow-y-auto">
                {uiGraph.routes.map(route => {
                  const capture = routeCaptures[route.id];
                  const status = capture?.status ?? 'idle';
                  return (
                    <div key={route.id} className={cn(
                      'flex items-start gap-2 px-3 py-1.5 border-b border-slate-50 last:border-0',
                      status === 'error' && 'bg-red-50/50'
                    )}>
                      <span className="mt-0.5 shrink-0">
                        {status === 'idle'    && <span className="block h-2 w-2 rounded-full bg-slate-200 mt-0.5" />}
                        {status === 'capturing' && <Loader2 className="h-3 w-3 animate-spin text-blue-400" />}
                        {status === 'done'    && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                        {status === 'error'   && <XCircle className="h-3 w-3 text-red-400" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-mono text-slate-700 truncate">{route.path}</p>
                        {status === 'error' && capture?.error && (
                          <p className="text-[9px] text-red-500 mt-0.5 break-words">{capture.error}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* React Flow canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={20} />
        <Controls className="shadow-sm" />
        <MiniMap
          nodeColor={(n) => colorMapRef.current.get(n.id) ?? '#bfdbfe'}
          maskColor="rgba(241,245,249,0.7)"
          className="shadow-sm"
        />

        {/* ── Filter bar ─────────────────────────────────────────────── */}
        <Panel position="bottom-left">
          <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-sm px-3 py-2">
            <button
              onClick={() => setHideBackEdges(v => !v)}
              className={cn(
                'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                hideBackEdges
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              )}
              title="Hide 'back' navigation edges"
            >
              <EyeOff className="h-3 w-3" />
              Back edges
            </button>
            {focusNodeId && (
              <button
                onClick={() => setFocusNodeId(null)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border bg-blue-600 text-white border-blue-600 transition-colors"
                title="Clear focus"
              >
                <Crosshair className="h-3 w-3" />
                Focused
              </button>
            )}
            {!focusNodeId && (
              <span className="text-[10px] text-slate-400">Click a node to focus</span>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>

    {/* Detail panel */}
    {selectedList && (
      <ListDetailPanel
        list={selectedList.list}
        routePath={selectedList.routePath}
        directoryPath={directoryPath ?? ''}
        onClose={() => setSelectedList(null)}
      />
    )}
    </div>
  );
}
