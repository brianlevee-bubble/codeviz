'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  type Node, type Edge, type OnConnect, type OnNodesDelete, type OnEdgesDelete,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useGraphStore } from '@/lib/store/graph-store';
import { BackendStepNode } from '@/components/backend-workflows/BackendStepNode';
import { BackendConnectionEdge } from '@/components/backend-workflows/BackendConnectionEdge';
import { BackendEditPanel } from '@/components/backend-workflows/BackendEditPanel';
import { DiffViewer } from '@/components/DiffViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  BackendWorkflow, BackendWorkflowsAnalysis,
  BackendStep, BackendConnection, StepKind,
} from '@/lib/backend-workflows/types';
import { Loader2, AlertCircle, RefreshCw, ChevronDown, Server, Plus, Save } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES = { backendStep: BackendStepNode as any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EDGE_TYPES = { backendConnection: BackendConnectionEdge as any };

const NODE_W = 192;
const NODE_H = 80;
const DECISION_SIZE = 88;

const DECISION_SOURCE_HANDLES = ['right', 'bottom', 'top'];

const TRIGGER_LABELS: Record<string, string> = {
  'api-route': 'API Route',
  'server-action': 'Server Action',
  cron: 'Cron Job',
  webhook: 'Webhook',
  queue: 'Queue',
  event: 'Event',
};

// ─── Layout ────────────────────────────────────────────────────────────────────

function buildGraph(
  workflow: BackendWorkflow,
  onSelectEdge: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph({ compound: false });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 120, ranksep: 220 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const decisionIds = new Set(workflow.steps.filter(s => s.kind === 'decision').map(s => s.id));

  for (const step of workflow.steps) {
    const isDecision = step.kind === 'decision';
    g.setNode(step.id, { width: isDecision ? DECISION_SIZE : NODE_W, height: isDecision ? DECISION_SIZE : NODE_H });
    nodes.push({
      id: step.id,
      type: 'backendStep',
      position: { x: 0, y: 0 },
      data: {
        label: step.label,
        description: step.description,
        kind: step.kind,
        file: step.file,
        method: step.method,
      },
    });
  }

  const decisionHandleIdx: Record<string, number> = {};

  for (const conn of workflow.connections) {
    if (!g.hasNode(conn.from) || !g.hasNode(conn.to)) continue;

    let sourceHandle: string | undefined;
    if (decisionIds.has(conn.from)) {
      const idx = decisionHandleIdx[conn.from] ?? 0;
      sourceHandle = DECISION_SOURCE_HANDLES[idx % DECISION_SOURCE_HANDLES.length];
      decisionHandleIdx[conn.from] = idx + 1;
    }

    edges.push({
      id: conn.id,
      source: conn.from,
      target: conn.to,
      sourceHandle,
      type: 'backendConnection',
      data: {
        label: conn.label,
        condition: conn.condition,
        onSelect: () => onSelectEdge(conn.id),
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
        color: '#94a3b8',
      },
    });
    g.setEdge(conn.from, conn.to);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      const isDecision = (node.data as { kind?: string }).kind === 'decision';
      const w = isDecision ? DECISION_SIZE : NODE_W;
      const h = isDecision ? DECISION_SIZE : NODE_H;
      node.position = { x: pos.x - w / 2, y: pos.y - h / 2 };
    }
  }

  return { nodes, edges };
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_backendworkflows_v1_';

function getCached(dirPath: string): BackendWorkflowsAnalysis | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + btoa(dirPath));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { workflows: parsed };
    return parsed as BackendWorkflowsAnalysis;
  } catch { return null; }
}

function setCached(dirPath: string, analysis: BackendWorkflowsAnalysis) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(analysis)); } catch { /* quota */ }
}

// ─── Legend ────────────────────────────────────────────────────────────────────

const LEGEND = [
  { kind: 'trigger',        label: 'Trigger',     color: 'bg-emerald-400' },
  { kind: 'process',        label: 'Process',     color: 'bg-blue-400' },
  { kind: 'data',           label: 'Data',        color: 'bg-violet-400' },
  { kind: 'integration',    label: 'Integration', color: 'bg-orange-400' },
  { kind: 'decision',       label: 'Decision',    color: 'bg-amber-400' },
  { kind: 'output',         label: 'Output',      color: 'bg-cyan-400' },
  { kind: 'error-handler',  label: 'Error',       color: 'bg-red-400' },
] as const;

const KIND_OPTIONS: { value: StepKind; label: string }[] = [
  { value: 'trigger', label: 'Trigger' },
  { value: 'process', label: 'Process' },
  { value: 'data', label: 'Data' },
  { value: 'integration', label: 'Integration' },
  { value: 'decision', label: 'Decision' },
  { value: 'output', label: 'Output' },
  { value: 'error-handler', label: 'Error Handler' },
];

// ─── Main view ─────────────────────────────────────────────────────────────────

export function BackendWorkflowsView() {
  const { directoryPath, setPreviewDiffs } = useGraphStore();

  const [analysis, setAnalysis] = useState<BackendWorkflowsAnalysis | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'scanning' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const loadedForPath = useRef<string | null>(null);

  const [originalWorkflow, setOriginalWorkflow] = useState<BackendWorkflow | null>(null);
  const [editedWorkflow, setEditedWorkflow] = useState<BackendWorkflow | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [addStepOpen, setAddStepOpen] = useState(false);
  const [addStepLabel, setAddStepLabel] = useState('');
  const [addStepKind, setAddStepKind] = useState<StepKind>('process');
  const [addStepDesc, setAddStepDesc] = useState('');

  const [addConnOpen, setAddConnOpen] = useState(false);
  const [addConnFrom, setAddConnFrom] = useState('');
  const [addConnTo, setAddConnTo] = useState('');
  const [addConnLabel, setAddConnLabel] = useState('');

  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');

  const hasChanges = !!(
    originalWorkflow &&
    editedWorkflow &&
    JSON.stringify(originalWorkflow) !== JSON.stringify(editedWorkflow)
  );

  const selectedStep = selectedNodeId
    ? editedWorkflow?.steps.find(s => s.id === selectedNodeId) ?? null
    : null;
  const selectedConnection = selectedEdgeId
    ? editedWorkflow?.connections.find(c => c.id === selectedEdgeId) ?? null
    : null;

  const onSelectEdgeRef = useRef<(id: string) => void>(() => {});
  const handleSelectEdge = useCallback((id: string) => {
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }, []);
  onSelectEdgeRef.current = handleSelectEdge;
  const stableSelectEdge = useCallback((id: string) => onSelectEdgeRef.current(id), []);

  // ── Load ────────────────────────────────────────────────────────────────────

  const setActiveWorkflow = useCallback((wf: BackendWorkflow) => {
    const copy: BackendWorkflow = JSON.parse(JSON.stringify(wf));
    setOriginalWorkflow(copy);
    setEditedWorkflow(copy);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    const { nodes: n, edges: e } = buildGraph(copy, stableSelectEdge);
    setNodes(n);
    setEdges(e);
  }, [stableSelectEdge, setNodes, setEdges]);

  const load = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) {
        setAnalysis(cached);
        if (cached.workflows.length > 0) {
          setActiveWorkflowId(cached.workflows[0].id);
          setActiveWorkflow(cached.workflows[0]);
        }
        setLoadPhase('done');
        return;
      }
    }

    setLoadPhase('scanning');
    setLoadError(null);
    setAnalysis(null);
    setTokenBuffer('');
    setOriginalWorkflow(null);
    setEditedWorkflow(null);

    try {
      const res = await fetch(`/api/backend-workflows?path=${encodeURIComponent(dirPath)}`);
      if (!res.ok || !res.body) {
        setLoadError(`HTTP ${res.status}`);
        setLoadPhase('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.phase === 'scanning') setLoadPhase('scanning');
            else if (ev.phase === 'analyzing') setLoadPhase('analyzing');
            else if (ev.phase === 'token') setTokenBuffer(t => t + ev.token);
            else if (ev.phase === 'complete') {
              const result: BackendWorkflowsAnalysis = {
                workflows: Array.isArray(ev.workflows) ? ev.workflows : [],
              };
              setCached(dirPath, result);
              setAnalysis(result);
              setTokenBuffer('');
              if (result.workflows.length > 0) {
                setActiveWorkflowId(result.workflows[0].id);
                setActiveWorkflow(result.workflows[0]);
              }
              setLoadPhase('done');
            } else if (ev.phase === 'error') {
              setLoadError(ev.error);
              setLoadPhase('error');
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed');
      setLoadPhase('error');
    }
  }, [setActiveWorkflow]);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      load(directoryPath);
    }
    return () => { loadedForPath.current = null; };
  }, [directoryPath, load]);

  const handleSelectWorkflow = useCallback((id: string) => {
    const wf = analysis?.workflows.find(w => w.id === id);
    if (!wf) return;
    setActiveWorkflowId(id);
    setSelectorOpen(false);
    setActiveWorkflow(wf);
  }, [analysis, setActiveWorkflow]);

  // ── Edit operations ─────────────────────────────────────────────────────────

  const handleUpdateStep = useCallback((stepId: string, patch: Partial<BackendStep>) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      return { ...prev, steps: prev.steps.map(s => s.id === stepId ? { ...s, ...patch } : s) };
    });
    setNodes(nds => nds.map(n => n.id === stepId
      ? { ...n, data: { ...n.data, ...patch } }
      : n
    ));
  }, [setNodes]);

  const handleUpdateConnection = useCallback((connId: string, patch: Partial<BackendConnection>) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      return { ...prev, connections: prev.connections.map(c => c.id === connId ? { ...c, ...patch } : c) };
    });
    setEdges(eds => eds.map(e => e.id === connId
      ? { ...e, data: { ...e.data, ...patch } }
      : e
    ));
  }, [setEdges]);

  const handleDeleteStep = useCallback((stepId: string) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.filter(s => s.id !== stepId),
        connections: prev.connections.filter(c => c.from !== stepId && c.to !== stepId),
      };
    });
    setNodes(nds => nds.filter(n => n.id !== stepId));
    setEdges(eds => eds.filter(e => e.source !== stepId && e.target !== stepId));
    setSelectedNodeId(null);
  }, [setNodes, setEdges]);

  const handleDeleteConnection = useCallback((connId: string) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      return { ...prev, connections: prev.connections.filter(c => c.id !== connId) };
    });
    setEdges(eds => eds.filter(e => e.id !== connId));
    setSelectedEdgeId(null);
  }, [setEdges]);

  const onNodesDelete: OnNodesDelete = useCallback((deleted) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      const ids = new Set(deleted.map(n => n.id));
      return {
        ...prev,
        steps: prev.steps.filter(s => !ids.has(s.id)),
        connections: prev.connections.filter(c => !ids.has(c.from) && !ids.has(c.to)),
      };
    });
    setSelectedNodeId(null);
  }, []);

  const onEdgesDelete: OnEdgesDelete = useCallback((deleted) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      const ids = new Set(deleted.map(e => e.id));
      return { ...prev, connections: prev.connections.filter(c => !ids.has(c.id)) };
    });
    setSelectedEdgeId(null);
  }, []);

  // ── Add Step ────────────────────────────────────────────────────────────────

  function handleAddStep() {
    if (!addStepLabel.trim() || !editedWorkflow) return;
    const id = `${addStepLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
    const newStep: BackendStep = {
      id,
      label: addStepLabel.trim(),
      kind: addStepKind,
      description: addStepDesc.trim() || undefined,
    };
    setEditedWorkflow(prev => prev ? { ...prev, steps: [...prev.steps, newStep] } : prev);

    const rightmostX = nodes.reduce((max, n) => Math.max(max, n.position.x + NODE_W), 0);
    const centerY = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length
      : 0;

    const newNode: Node = {
      id,
      type: 'backendStep',
      position: { x: rightmostX + 100, y: centerY },
      data: { label: newStep.label, kind: addStepKind, description: newStep.description },
    };
    setNodes(nds => [...nds, newNode]);
    setAddStepLabel('');
    setAddStepDesc('');
    setAddStepKind('process');
    setAddStepOpen(false);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }

  // ── Add Connection (dialog) ─────────────────────────────────────────────────

  function openAddConnection() {
    const steps = editedWorkflow?.steps ?? [];
    setAddConnFrom(steps[0]?.id ?? '');
    setAddConnTo(steps[1]?.id ?? steps[0]?.id ?? '');
    setAddConnLabel('');
    setAddConnOpen(true);
  }

  function handleAddConnection() {
    if (!addConnFrom || !addConnTo || !editedWorkflow) return;
    const id = `c_${addConnFrom}_${addConnTo}_${Date.now()}`;
    const newConn: BackendConnection = {
      id,
      from: addConnFrom,
      to: addConnTo,
      label: addConnLabel.trim() || undefined,
    };
    setEditedWorkflow(prev => prev ? { ...prev, connections: [...prev.connections, newConn] } : prev);
    const newEdge: Edge = {
      id,
      source: addConnFrom,
      target: addConnTo,
      type: 'backendConnection',
      data: { label: newConn.label, onSelect: () => stableSelectEdge(id) },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#94a3b8' },
    };
    setEdges(eds => [...eds, newEdge]);
    setAddConnOpen(false);
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }

  // ── Add Connection (drag connect) ───────────────────────────────────────────

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || !editedWorkflow) return;
    const id = `c_${connection.source}_${connection.target}_${Date.now()}`;
    const newConn: BackendConnection = {
      id, from: connection.source, to: connection.target,
    };
    setEditedWorkflow(prev => prev ? { ...prev, connections: [...prev.connections, newConn] } : prev);
    const newEdge: Edge = {
      id,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      type: 'backendConnection',
      data: { onSelect: () => stableSelectEdge(id) },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: '#94a3b8' },
    };
    setEdges(eds => [...eds, newEdge]);
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }, [editedWorkflow, stableSelectEdge, setEdges]);

  // ── Apply to code ────────────────────────────────────────────────────────────

  async function handleApplyChanges() {
    if (!originalWorkflow || !editedWorkflow || !directoryPath) return;
    setDiffLoading(true);
    setDiffError('');
    try {
      const res = await fetch('/api/workflow-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directoryPath, originalWorkflow, editedWorkflow }),
      });
      const data = await res.json() as { diffs?: unknown[]; error?: string };
      if (!res.ok) { setDiffError(data.error ?? 'Failed'); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPreviewDiffs((data.diffs ?? []) as any);
      setDiffOpen(true);
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setDiffLoading(false);
    }
  }

  function handleDiffApplied() {
    if (editedWorkflow) {
      const copy: BackendWorkflow = JSON.parse(JSON.stringify(editedWorkflow));
      setOriginalWorkflow(copy);
    }
    setDiffOpen(false);
  }

  // ── Loading states ──────────────────────────────────────────────────────────

  if (loadPhase === 'idle' || loadPhase === 'scanning') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Searching for backend workflows…</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'analyzing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full px-8">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
          <p className="text-sm text-slate-600 font-medium">Extracting backend workflow definitions…</p>
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

  if (loadPhase === 'done' && (!analysis || analysis.workflows.length === 0)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400 max-w-xs text-center">
          <Server className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No backend workflows found</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            CodeViz looks for API route handlers, server actions, cron jobs, webhook handlers, queue consumers, and other server-side process chains.
          </p>
          <Button variant="outline" size="sm" className="mt-1"
            onClick={() => directoryPath && load(directoryPath, true)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-analyze
          </Button>
        </div>
      </div>
    );
  }

  const activeWorkflow = analysis?.workflows.find(w => w.id === activeWorkflowId) ?? analysis?.workflows[0];
  if (!activeWorkflow) return null;

  const hasMultiple = (analysis?.workflows.length ?? 0) > 1;
  const totalSteps = (editedWorkflow ?? activeWorkflow).steps.length;
  const totalConnections = (editedWorkflow ?? activeWorkflow).connections.length;

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Top toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2 flex-wrap">
        {/* Workflow selector */}
        {hasMultiple ? (
          <div className="relative">
            <button
              onClick={() => setSelectorOpen(o => !o)}
              className="flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Server className="h-3.5 w-3.5 text-emerald-500" />
              {activeWorkflow.name}
              <span className="text-slate-400 font-normal">{TRIGGER_LABELS[activeWorkflow.triggerType]}</span>
              <ChevronDown className={cn('h-3 w-3 text-slate-400 transition-transform', selectorOpen && 'rotate-180')} />
            </button>
            {selectorOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-full overflow-hidden z-20 max-h-64 overflow-y-auto">
                {analysis!.workflows.map(wf => (
                  <button
                    key={wf.id}
                    onClick={() => handleSelectWorkflow(wf.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2',
                      wf.id === activeWorkflowId && 'bg-blue-50 text-blue-700 font-medium'
                    )}
                  >
                    <span>{wf.name}</span>
                    <span className="text-slate-400">{TRIGGER_LABELS[wf.triggerType]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs shadow-sm">
            <Server className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-semibold text-slate-700">{activeWorkflow.name}</span>
            <span className="text-slate-400">{TRIGGER_LABELS[activeWorkflow.triggerType]}</span>
          </div>
        )}

        {/* Stats */}
        <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 shadow-sm flex items-center gap-2.5">
          <span><span className="font-semibold text-slate-700">{totalSteps}</span> steps</span>
          <span className="text-slate-200">·</span>
          <span><span className="font-semibold text-slate-700">{totalConnections}</span> connections</span>
        </div>

        {/* Add Step / Add Connection */}
        {editedWorkflow && (
          <>
            <Button
              size="sm" variant="outline"
              onClick={() => setAddStepOpen(true)}
              className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Step
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={openAddConnection}
              className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Connection
            </Button>
          </>
        )}

        {/* Apply Changes */}
        {hasChanges && (
          <Button
            size="sm"
            onClick={handleApplyChanges}
            disabled={diffLoading}
            className="h-7 px-2.5 text-xs bg-blue-600 hover:bg-blue-700 text-white border-0"
          >
            {diffLoading
              ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Generating…</>
              : <><Save className="h-3 w-3 mr-1" /> Apply Changes</>
            }
          </Button>
        )}

        {/* Re-analyze */}
        <Button
          size="sm" variant="outline"
          onClick={() => directoryPath && load(directoryPath, true)}
          className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
        >
          <RefreshCw className="h-3 w-3 mr-1" /> Re-analyze
        </Button>
      </div>

      {/* Diff error */}
      {diffError && (
        <div className="absolute top-14 left-3 z-10 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-lg shadow-sm">
          {diffError}
        </div>
      )}

      {/* Edit hint */}
      {editedWorkflow && !selectedStep && !selectedConnection && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm pointer-events-none">
          <p className="text-[10px] text-slate-400 text-center">
            Click a step or connection to edit · Drag between handles to connect · Delete key removes selected
          </p>
        </div>
      )}

      {/* Description */}
      {activeWorkflow.description && !selectedStep && !selectedConnection && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm max-w-sm">
          <p className="text-[10px] text-slate-500 text-center">{activeWorkflow.description}</p>
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Legend</p>
        <div className="flex flex-col gap-1">
          {LEGEND.map(({ kind, label, color }) => (
            <div key={kind} className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full shrink-0', color)} />
              <span className="text-[10px] text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Edit panel */}
      <BackendEditPanel
        selectedStep={selectedStep}
        selectedConnection={selectedConnection}
        onUpdateStep={handleUpdateStep}
        onUpdateConnection={handleUpdateConnection}
        onDeleteStep={handleDeleteStep}
        onDeleteConnection={handleDeleteConnection}
        onClose={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onConnect={onConnect}
        onNodeClick={(_, node) => {
          setSelectedNodeId(node.id);
          setSelectedEdgeId(null);
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdgeId(edge.id);
          setSelectedNodeId(null);
        }}
        onPaneClick={() => {
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          setSelectorOpen(false);
        }}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        connectionLineStyle={{ stroke: '#94a3b8', strokeWidth: 2 }}
      >
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <marker id="backend-arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
              <path d="M 0 0 L 0 6 L 9 3 z" fill="#94a3b8" />
            </marker>
          </defs>
        </svg>

        <Background color="#e2e8f0" gap={20} />
        <Controls className="shadow-sm" />
        <MiniMap
          nodeColor={(n) => {
            const kind = (n.data as { kind?: string }).kind;
            if (kind === 'trigger')        return '#6ee7b7';
            if (kind === 'process')        return '#93c5fd';
            if (kind === 'data')           return '#c4b5fd';
            if (kind === 'integration')    return '#fdba74';
            if (kind === 'decision')       return '#fcd34d';
            if (kind === 'output')         return '#67e8f9';
            if (kind === 'error-handler')  return '#fca5a5';
            return '#e2e8f0';
          }}
          maskColor="rgba(241,245,249,0.7)"
          className="shadow-sm"
        />
      </ReactFlow>

      {/* Add Step dialog */}
      <Dialog open={addStepOpen} onOpenChange={setAddStepOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Step</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={addStepLabel}
                onChange={e => setAddStepLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddStep()}
                className="h-8 text-xs"
                placeholder="e.g. Validate Input"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kind</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {KIND_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAddStepKind(opt.value)}
                    className={cn(
                      'text-xs py-1.5 px-2 rounded border transition-colors',
                      addStepKind === opt.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description <span className="text-slate-400">(optional)</span></Label>
              <Input
                value={addStepDesc}
                onChange={e => setAddStepDesc(e.target.value)}
                className="h-8 text-xs"
                placeholder="What does this step do?"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setAddStepOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAddStep} disabled={!addStepLabel.trim()}>Add Step</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Connection dialog */}
      <Dialog open={addConnOpen} onOpenChange={setAddConnOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Connection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Label <span className="text-slate-400">(optional)</span></Label>
              <Input
                value={addConnLabel}
                onChange={e => setAddConnLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddConnection()}
                className="h-8 text-xs"
                placeholder="e.g. on success, next"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <select
                  value={addConnFrom}
                  onChange={e => setAddConnFrom(e.target.value)}
                  className="w-full h-8 text-xs rounded-md border border-slate-200 px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  {(editedWorkflow?.steps ?? []).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <select
                  value={addConnTo}
                  onChange={e => setAddConnTo(e.target.value)}
                  className="w-full h-8 text-xs rounded-md border border-slate-200 px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  {(editedWorkflow?.steps ?? []).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setAddConnOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleAddConnection}
                disabled={!addConnFrom || !addConnTo}
              >
                Add Connection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diff viewer */}
      <DiffViewer
        open={diffOpen}
        onClose={() => setDiffOpen(false)}
        onApplied={handleDiffApplied}
      />
    </div>
  );
}
