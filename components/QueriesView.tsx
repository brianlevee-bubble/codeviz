'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  type Node, type Edge, type NodeTypes,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useGraphStore } from '@/lib/store/graph-store';
import { QueryPageNode } from '@/components/queries/QueryPageNode';
import { QueryListNode } from '@/components/queries/QueryListNode';
import { QueryTableNode } from '@/components/queries/QueryTableNode';
import type { QueriesGraph, DataList, PageQueries } from '@/lib/queries/types';
import { Loader2, AlertCircle, RefreshCw, X, FileCode, Filter, ArrowUpDown, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NODE_TYPES: NodeTypes = {
  queryPage:  QueryPageNode,
  queryList:  QueryListNode,
  queryTable: QueryTableNode,
};

// ─── Layout ────────────────────────────────────────────────────────────────────

function buildGraph(graph: QueriesGraph): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph({ compound: false });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80, align: 'UL' });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Collect all unique table names and count usages
  const tableUsage = new Map<string, number>();
  for (const page of graph.pages) {
    for (const list of page.lists) {
      for (const t of list.tables) tableUsage.set(t, (tableUsage.get(t) ?? 0) + 1);
    }
  }

  // Table node ids
  const tableNodeId = (t: string) => `table_${t.toLowerCase().replace(/\W/g, '_')}`;

  // Add page + list nodes
  for (const page of graph.pages) {
    const pageW = 150, pageH = 90;
    g.setNode(page.id, { width: pageW, height: pageH });
    nodes.push({
      id: page.id, type: 'queryPage',
      position: { x: 0, y: 0 },
      data: { label: page.label, route: page.route, listCount: page.lists.length },
    });

    for (const list of page.lists) {
      const listW = 224, listH = 160;
      g.setNode(list.id, { width: listW, height: listH });
      nodes.push({
        id: list.id, type: 'queryList',
        position: { x: 0, y: 0 },
        data: {
          name: list.name, description: list.description,
          queryType: list.queryType, filters: list.filters,
          sort: list.sort, limit: list.limit,
          isPaginated: list.isPaginated, query: list.query,
          file: list.file,
        },
      });

      // Page → List edge
      edges.push({
        id: `e_${page.id}_${list.id}`,
        source: page.id, target: list.id,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#93c5fd' },
        style: { stroke: '#93c5fd', strokeWidth: 1.5 },
      });

      // List → Table edges
      for (const table of list.tables) {
        const tid = tableNodeId(table);
        if (!g.hasNode(tid)) {
          g.setNode(tid, { width: 130, height: 40 });
          nodes.push({
            id: tid, type: 'queryTable',
            position: { x: 0, y: 0 },
            data: { label: table, usageCount: tableUsage.get(table) ?? 1 },
          });
        }
        const eid = `e_${list.id}_${tid}`;
        if (!edges.find(e => e.id === eid)) {
          edges.push({
            id: eid,
            source: list.id, target: tid,
            markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#fdba74' },
            style: { stroke: '#fdba74', strokeWidth: 1.5, strokeDasharray: '4 2' },
          });
          g.setEdge(list.id, tid);
        }
      }

      g.setEdge(page.id, list.id);
    }
  }

  dagre.layout(g);

  // Apply positions
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      const dim = g.node(node.id) as { width: number; height: number };
      node.position = { x: pos.x - dim.width / 2, y: pos.y - dim.height / 2 };
    }
  }

  return { nodes, edges };
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  list, page, onClose,
}: { list: DataList; page: PageQueries; onClose: () => void }) {
  return (
    <div className="w-80 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div>
          <p className="text-sm font-semibold text-slate-900">{list.name}</p>
          <p className="text-[10px] text-slate-400">{page.label} · {page.route}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Description */}
        <p className="text-xs text-slate-600 leading-relaxed">{list.description}</p>

        {/* Meta */}
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

        {/* Filters */}
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

        {/* Tables */}
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

        {/* Query */}
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Query</p>
          <pre className="text-[10px] font-mono text-slate-700 bg-slate-950/[0.04] rounded-xl p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all border border-slate-100">
            <code>{list.query}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_queries_v1_';
function getCached(dirPath: string): QueriesGraph | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}
function setCached(dirPath: string, graph: QueriesGraph) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(graph)); } catch { /* quota */ }
}
export function clearQueriesCache(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Main view ─────────────────────────────────────────────────────────────────

export function QueriesView() {
  const { directoryPath } = useGraphStore();
  const [graph, setGraph] = useState<QueriesGraph | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const loadedForPath = useRef<string | null>(null);

  const load = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) {
        setGraph(cached);
        const { nodes: n, edges: e } = buildGraph(cached);
        setNodes(n); setEdges(e);
        setLoadPhase('done'); return;
      }
    }
    setLoadPhase('reading');
    setLoadError(null);
    setGraph(null);
    setTokenBuffer('');
    setSelectedListId(null);

    const res = await fetch(`/api/queries?path=${encodeURIComponent(dirPath)}`);
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
            const g = ev.graph as QueriesGraph;
            setCached(dirPath, g);
            setGraph(g);
            const { nodes: n, edges: e } = buildGraph(g);
            setNodes(n);
            setEdges(e);
            setLoadPhase('done');
            setTokenBuffer('');
          } else if (ev.phase === 'error') {
            setLoadError(ev.error);
            setLoadPhase('error');
          }
        } catch { /* skip */ }
      }
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      load(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  // Find selected list + its parent page
  const selectedList = graph?.pages.flatMap(p => p.lists).find(l => l.id === selectedListId) ?? null;
  const selectedPage = selectedList
    ? (graph?.pages.find(p => p.lists.some(l => l.id === selectedListId)) ?? null)
    : null;

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type === 'queryList') setSelectedListId(node.id);
    else setSelectedListId(null);
  }, []);

  // ── Loading states ─────────────────────────────────────────────────────────

  if (loadPhase === 'reading' || loadPhase === 'idle') {
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
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-600 font-medium">Extracting list queries…</p>
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
          <Button variant="outline" size="sm" onClick={() => directoryPath && load(directoryPath)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!graph) return null;

  const totalLists = graph.pages.reduce((n, p) => n + p.lists.length, 0);
  const totalTables = new Set(graph.pages.flatMap(p => p.lists.flatMap(l => l.tables))).size;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Canvas */}
      <div className="flex-1 relative">
        {/* Stats bar */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 shadow-sm flex items-center gap-3">
            <span><span className="font-semibold text-blue-600">{graph.pages.length}</span> pages</span>
            <span className="text-slate-300">·</span>
            <span><span className="font-semibold text-green-600">{totalLists}</span> lists</span>
            <span className="text-slate-300">·</span>
            <span><span className="font-semibold text-orange-500">{totalTables}</span> tables</span>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => directoryPath && load(directoryPath)}
            className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>

        {/* Legend */}
        <div className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="block w-3 h-3 rounded border-2 border-blue-300 bg-blue-50" />
              Page
            </span>
            <span className="flex items-center gap-1">
              <span className="block w-3 h-3 rounded border-2 border-green-300 bg-green-50" />
              List
            </span>
            <span className="flex items-center gap-1">
              <span className="block w-4 h-3 rounded-full border-2 border-orange-300 bg-orange-50" />
              Table
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">Click a list node to inspect the query</p>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedListId(null)}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls className="shadow-sm" />
          <MiniMap
            nodeColor={(n) =>
              n.type === 'queryPage' ? '#bfdbfe'
              : n.type === 'queryList' ? '#bbf7d0'
              : '#fed7aa'
            }
            maskColor="rgba(241,245,249,0.7)"
            className="shadow-sm"
          />
        </ReactFlow>

        {/* No lists found */}
        {graph.pages.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-slate-400 space-y-2">
              <p className="text-sm">No list queries found</p>
              <p className="text-xs">This app may not have list-rendering pages, or the queries couldn&apos;t be detected</p>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedList && selectedPage && (
        <DetailPanel
          list={selectedList}
          page={selectedPage}
          onClose={() => setSelectedListId(null)}
        />
      )}
    </div>
  );
}
