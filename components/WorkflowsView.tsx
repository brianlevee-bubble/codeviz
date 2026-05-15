'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  type Node, type Edge, type OnConnect, type OnNodesDelete, type OnEdgesDelete,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useGraphStore } from '@/lib/store/graph-store';
import { WorkflowStateNode } from '@/components/workflows/WorkflowStateNode';
import { WorkflowTransitionEdge } from '@/components/workflows/WorkflowTransitionEdge';
import { WorkflowEditPanel } from '@/components/workflows/WorkflowEditPanel';
import { DiffViewer } from '@/components/DiffViewer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Workflow, WorkflowsAnalysis, WorkflowState, WorkflowTransition, StateKind } from '@/lib/workflows/types';
import { Loader2, AlertCircle, RefreshCw, ChevronDown, Zap, Plus, Save } from 'lucide-react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES = { workflowState: WorkflowStateNode as any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const EDGE_TYPES = { workflowTransition: WorkflowTransitionEdge as any };

const NODE_W = 176;
const NODE_H = 72;
const GATEWAY_SIZE = 88;

const GATEWAY_SOURCE_HANDLES = ['right', 'bottom', 'top'];

// ─── Layout ────────────────────────────────────────────────────────────────────

function buildGraph(
  workflow: Workflow,
  onSelectEdge: (id: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph({ compound: false });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 160, ranksep: 260 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const gatewayIds = new Set(workflow.states.filter(s => s.kind === 'gateway').map(s => s.id));

  for (const state of workflow.states) {
    const isGateway = state.kind === 'gateway';
    g.setNode(state.id, { width: isGateway ? GATEWAY_SIZE : NODE_W, height: isGateway ? GATEWAY_SIZE : NODE_H });
    nodes.push({
      id: state.id,
      type: 'workflowState',
      position: { x: 0, y: 0 },
      data: { label: state.label, description: state.description, kind: state.kind as StateKind },
    });
  }

  const gatewayHandleIdx: Record<string, number> = {};

  for (const t of workflow.transitions) {
    if (!g.hasNode(t.from) || !g.hasNode(t.to)) continue;
    const eid = t.id || `e_${t.from}_${t.to}`;

    let sourceHandle: string | undefined;
    if (gatewayIds.has(t.from)) {
      const idx = gatewayHandleIdx[t.from] ?? 0;
      sourceHandle = GATEWAY_SOURCE_HANDLES[idx % GATEWAY_SOURCE_HANDLES.length];
      gatewayHandleIdx[t.from] = idx + 1;
    }

    edges.push(makeEdge(t, eid, sourceHandle, onSelectEdge));
    g.setEdge(t.from, t.to);
  }

  dagre.layout(g);

  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      const isGateway = (node.data as { kind?: string }).kind === 'gateway';
      const w = isGateway ? GATEWAY_SIZE : NODE_W;
      const h = isGateway ? GATEWAY_SIZE : NODE_H;
      node.position = { x: pos.x - w / 2, y: pos.y - h / 2 };
    }
  }

  return { nodes, edges };
}

function makeEdge(
  t: WorkflowTransition,
  eid: string,
  sourceHandle: string | undefined,
  onSelectEdge: (id: string) => void,
): Edge {
  return {
    id: eid,
    source: t.from,
    target: t.to,
    sourceHandle,
    type: 'workflowTransition',
    data: {
      action: t.action,
      actors: t.actors ?? [],
      guards: t.guards ?? [],
      sideEffects: t.sideEffects ?? [],
      isRegression: t.isRegression ?? false,
      onSelect: () => onSelectEdge(eid),
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 14,
      height: 14,
      color: t.isRegression ? '#f59e0b' : '#94a3b8',
    },
  };
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_workflows_v3_';

function getCached(dirPath: string): WorkflowsAnalysis | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + btoa(dirPath));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { workflows: parsed };
    return parsed as WorkflowsAnalysis;
  } catch { return null; }
}

function setCached(dirPath: string, analysis: WorkflowsAnalysis) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(analysis)); } catch { /* quota */ }
}

// ─── Legend ────────────────────────────────────────────────────────────────────

const LEGEND = [
  { kind: 'initial',  label: 'Start',    color: 'bg-slate-300'  },
  { kind: 'active',   label: 'Active',   color: 'bg-blue-400'   },
  { kind: 'review',   label: 'Review',   color: 'bg-amber-400'  },
  { kind: 'terminal', label: 'Done',     color: 'bg-green-500'  },
  { kind: 'error',    label: 'Error',    color: 'bg-red-400'    },
  { kind: 'gateway',  label: 'Decision', color: 'bg-blue-200'   },
] as const;

const KIND_OPTIONS: { value: StateKind; label: string }[] = [
  { value: 'initial', label: 'Start' },
  { value: 'active', label: 'Active' },
  { value: 'review', label: 'Review' },
  { value: 'terminal', label: 'Done' },
  { value: 'error', label: 'Error' },
  { value: 'gateway', label: 'Decision' },
];

// ─── Main view ─────────────────────────────────────────────────────────────────

export function WorkflowsView() {
  const { directoryPath, setPreviewDiffs } = useGraphStore();

  const [analysis, setAnalysis] = useState<WorkflowsAnalysis | null>(null);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'scanning' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [selectorOpen, setSelectorOpen] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const loadedForPath = useRef<string | null>(null);

  // ── Editing state ──────────────────────────────────────────────────────────
  const [originalWorkflow, setOriginalWorkflow] = useState<Workflow | null>(null);
  const [editedWorkflow, setEditedWorkflow] = useState<Workflow | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Add state dialog
  const [addStateOpen, setAddStateOpen] = useState(false);
  const [addStateLabel, setAddStateLabel] = useState('');
  const [addStateKind, setAddStateKind] = useState<StateKind>('active');
  const [addStateDesc, setAddStateDesc] = useState('');

  // Add transition dialog
  const [addTransitionOpen, setAddTransitionOpen] = useState(false);
  const [addTransitionFrom, setAddTransitionFrom] = useState('');
  const [addTransitionTo, setAddTransitionTo] = useState('');
  const [addTransitionAction, setAddTransitionAction] = useState('');

  // Apply to code
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState('');

  const hasChanges = !!(
    originalWorkflow &&
    editedWorkflow &&
    JSON.stringify(originalWorkflow) !== JSON.stringify(editedWorkflow)
  );

  // Derived: the selected state/transition for the edit panel
  const selectedState = selectedNodeId
    ? editedWorkflow?.states.find(s => s.id === selectedNodeId) ?? null
    : null;
  const selectedTransition = selectedEdgeId
    ? editedWorkflow?.transitions.find(t => t.id === selectedEdgeId) ?? null
    : null;

  // ── onSelectEdge ref — stable callback passed into buildGraph ──────────────
  const onSelectEdgeRef = useRef<(id: string) => void>(() => {});
  const handleSelectEdge = useCallback((id: string) => {
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }, []);
  onSelectEdgeRef.current = handleSelectEdge;

  const stableSelectEdge = useCallback((id: string) => onSelectEdgeRef.current(id), []);

  // ── Load ────────────────────────────────────────────────────────────────────

  const setActiveWorkflow = useCallback((wf: Workflow) => {
    const copy: Workflow = JSON.parse(JSON.stringify(wf));
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
      if (cached && cached.workflows.length > 0) {
        setAnalysis(cached);
        setActiveWorkflowId(cached.workflows[0].id);
        setActiveWorkflow(cached.workflows[0]);
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
      const res = await fetch(`/api/workflows?path=${encodeURIComponent(dirPath)}`);
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
              const result: WorkflowsAnalysis = {
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
  }, [directoryPath, load]);

  const handleSelectWorkflow = useCallback((id: string) => {
    const wf = analysis?.workflows.find(w => w.id === id);
    if (!wf) return;
    setActiveWorkflowId(id);
    setSelectorOpen(false);
    setActiveWorkflow(wf);
  }, [analysis, setActiveWorkflow]);

  // ── Edit operations ─────────────────────────────────────────────────────────

  const handleUpdateState = useCallback((stateId: string, patch: Partial<WorkflowState>) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      return { ...prev, states: prev.states.map(s => s.id === stateId ? { ...s, ...patch } : s) };
    });
    setNodes(nds => nds.map(n => n.id === stateId
      ? { ...n, data: { ...n.data, ...patch } }
      : n
    ));
  }, [setNodes]);

  const handleUpdateTransition = useCallback((transId: string, patch: Partial<WorkflowTransition>) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      return { ...prev, transitions: prev.transitions.map(t => t.id === transId ? { ...t, ...patch } : t) };
    });
    setEdges(eds => eds.map(e => e.id === transId
      ? { ...e, data: { ...e.data, ...patch } }
      : e
    ));
  }, [setEdges]);

  const handleDeleteState = useCallback((stateId: string) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        states: prev.states.filter(s => s.id !== stateId),
        transitions: prev.transitions.filter(t => t.from !== stateId && t.to !== stateId),
      };
    });
    setNodes(nds => nds.filter(n => n.id !== stateId));
    setEdges(eds => eds.filter(e => e.source !== stateId && e.target !== stateId));
    setSelectedNodeId(null);
  }, [setNodes, setEdges]);

  const handleDeleteTransition = useCallback((transId: string) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      return { ...prev, transitions: prev.transitions.filter(t => t.id !== transId) };
    });
    setEdges(eds => eds.filter(e => e.id !== transId));
    setSelectedEdgeId(null);
  }, [setEdges]);

  // Sync RF keyboard delete → editedWorkflow
  const onNodesDelete: OnNodesDelete = useCallback((deleted) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      const ids = new Set(deleted.map(n => n.id));
      return {
        ...prev,
        states: prev.states.filter(s => !ids.has(s.id)),
        transitions: prev.transitions.filter(t => !ids.has(t.from) && !ids.has(t.to)),
      };
    });
    setSelectedNodeId(null);
  }, []);

  const onEdgesDelete: OnEdgesDelete = useCallback((deleted) => {
    setEditedWorkflow(prev => {
      if (!prev) return prev;
      const ids = new Set(deleted.map(e => e.id));
      return { ...prev, transitions: prev.transitions.filter(t => !ids.has(t.id)) };
    });
    setSelectedEdgeId(null);
  }, []);

  // ── Add State ────────────────────────────────────────────────────────────────

  function handleAddState() {
    if (!addStateLabel.trim() || !editedWorkflow) return;
    const id = `${addStateLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
    const newState: WorkflowState = {
      id,
      label: addStateLabel.trim().toUpperCase(),
      kind: addStateKind,
      description: addStateDesc.trim() || undefined,
    };
    setEditedWorkflow(prev => prev ? { ...prev, states: [...prev.states, newState] } : prev);

    // Place to the right of the rightmost node
    const rightmostX = nodes.reduce((max, n) => Math.max(max, n.position.x + NODE_W), 0);
    const centerY = nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length
      : 0;

    const newNode: Node = {
      id,
      type: 'workflowState',
      position: { x: rightmostX + 100, y: centerY },
      data: { label: newState.label, kind: addStateKind, description: newState.description },
    };
    setNodes(nds => [...nds, newNode]);
    setAddStateLabel('');
    setAddStateDesc('');
    setAddStateKind('active');
    setAddStateOpen(false);
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }

  // ── Add Transition (dialog) ─────────────────────────────────────────────────

  function openAddTransition() {
    const states = editedWorkflow?.states ?? [];
    setAddTransitionFrom(states[0]?.id ?? '');
    setAddTransitionTo(states[1]?.id ?? states[0]?.id ?? '');
    setAddTransitionAction('');
    setAddTransitionOpen(true);
  }

  function handleAddTransition() {
    if (!addTransitionAction.trim() || !addTransitionFrom || !addTransitionTo || !editedWorkflow) return;
    const id = `t_${addTransitionFrom}_${addTransitionTo}_${Date.now()}`;
    const newTransition: WorkflowTransition = {
      id,
      from: addTransitionFrom,
      to: addTransitionTo,
      action: addTransitionAction.trim(),
      actors: [],
      guards: [],
      isRegression: false,
    };
    setEditedWorkflow(prev => prev ? { ...prev, transitions: [...prev.transitions, newTransition] } : prev);
    const newEdge = makeEdge(newTransition, id, undefined, stableSelectEdge);
    setEdges(eds => [...eds, newEdge]);
    setAddTransitionOpen(false);
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }

  // ── Add Transition (drag connect) ───────────────────────────────────────────

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || !editedWorkflow) return;
    const id = `t_${connection.source}_${connection.target}_${Date.now()}`;
    const newTransition: WorkflowTransition = {
      id, from: connection.source, to: connection.target,
      action: 'New Action', actors: [], guards: [], isRegression: false,
    };
    setEditedWorkflow(prev => prev ? { ...prev, transitions: [...prev.transitions, newTransition] } : prev);
    const newEdge = makeEdge(newTransition, id, connection.sourceHandle ?? undefined, stableSelectEdge);
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
    // After applying, the edited workflow becomes the new original
    if (editedWorkflow) {
      const copy: Workflow = JSON.parse(JSON.stringify(editedWorkflow));
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
          <span className="text-sm">Searching for state machines…</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'analyzing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full px-8">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          <p className="text-sm text-slate-600 font-medium">Extracting workflow definitions…</p>
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
          <Zap className="h-10 w-10 text-slate-200" />
          <p className="text-sm font-medium text-slate-500">No state machines found</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            CodeViz looks for TypeScript enums or union types ending in <code className="font-mono bg-slate-100 px-1 rounded">Status</code>, <code className="font-mono bg-slate-100 px-1 rounded">State</code>, or <code className="font-mono bg-slate-100 px-1 rounded">Phase</code>, along with their transition logic.
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
  const totalTransitions = (editedWorkflow ?? activeWorkflow).transitions.length;
  const regressionCount = (editedWorkflow ?? activeWorkflow).transitions.filter(t => t.isRegression).length;

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Top toolbar */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        {/* Workflow selector */}
        {hasMultiple ? (
          <div className="relative">
            <button
              onClick={() => setSelectorOpen(o => !o)}
              className="flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              {activeWorkflow.entity}
              {activeWorkflow.enumName && <span className="text-slate-400 font-normal">{activeWorkflow.enumName}</span>}
              <ChevronDown className={cn('h-3 w-3 text-slate-400 transition-transform', selectorOpen && 'rotate-180')} />
            </button>
            {selectorOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-full overflow-hidden z-20">
                {analysis!.workflows.map(wf => (
                  <button
                    key={wf.id}
                    onClick={() => handleSelectWorkflow(wf.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-xs hover:bg-slate-50 flex items-center gap-2',
                      wf.id === activeWorkflowId && 'bg-blue-50 text-blue-700 font-medium'
                    )}
                  >
                    <span>{wf.entity}</span>
                    {wf.enumName && <span className="text-slate-400">{wf.enumName}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs shadow-sm">
            <Zap className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-semibold text-slate-700">{activeWorkflow.entity}</span>
            {activeWorkflow.enumName && <span className="text-slate-400">{activeWorkflow.enumName}</span>}
          </div>
        )}

        {/* Stats */}
        <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 shadow-sm flex items-center gap-2.5">
          <span><span className="font-semibold text-slate-700">{(editedWorkflow ?? activeWorkflow).states.length}</span> states</span>
          <span className="text-slate-200">·</span>
          <span><span className="font-semibold text-slate-700">{totalTransitions}</span> transitions</span>
          {regressionCount > 0 && (
            <>
              <span className="text-slate-200">·</span>
              <span><span className="font-semibold text-amber-600">{regressionCount}</span> regressions</span>
            </>
          )}
        </div>

        {/* Add State / Add Transition */}
        {editedWorkflow && (
          <>
            <Button
              size="sm" variant="outline"
              onClick={() => setAddStateOpen(true)}
              className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
            >
              <Plus className="h-3 w-3 mr-1" /> Add State
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={openAddTransition}
              className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Transition
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
      {editedWorkflow && !selectedState && !selectedTransition && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm pointer-events-none">
          <p className="text-[10px] text-slate-400 text-center">
            Click a state or transition to edit · Drag between handles to add a transition · Delete key removes selected
          </p>
        </div>
      )}

      {/* Description */}
      {activeWorkflow.description && !editedWorkflow && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm max-w-sm">
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
          <div className="flex items-center gap-1.5 mt-0.5 pt-1 border-t border-slate-100">
            <svg width="16" height="6" className="shrink-0">
              <line x1="0" y1="3" x2="16" y2="3" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 2" />
            </svg>
            <span className="text-[10px] text-slate-500">Regression</span>
          </div>
        </div>
      </div>

      {/* Edit panel */}
      <WorkflowEditPanel
        selectedState={selectedState}
        selectedTransition={selectedTransition}
        onUpdateState={handleUpdateState}
        onUpdateTransition={handleUpdateTransition}
        onDeleteState={handleDeleteState}
        onDeleteTransition={handleDeleteTransition}
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
            <marker id="workflow-forward-arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
              <path d="M 0 0 L 0 6 L 9 3 z" fill="#94a3b8" />
            </marker>
            <marker id="workflow-regression-arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto">
              <path d="M 0 0 L 0 6 L 9 3 z" fill="#f59e0b" />
            </marker>
          </defs>
        </svg>

        <Background color="#e2e8f0" gap={20} />
        <Controls className="shadow-sm" />
        <MiniMap
          nodeColor={(n) => {
            const kind = (n.data as { kind?: string }).kind;
            if (kind === 'initial')  return '#cbd5e1';
            if (kind === 'active')   return '#93c5fd';
            if (kind === 'review')   return '#fcd34d';
            if (kind === 'terminal') return '#86efac';
            if (kind === 'error')    return '#fca5a5';
            if (kind === 'gateway')  return '#bfdbfe';
            return '#e2e8f0';
          }}
          maskColor="rgba(241,245,249,0.7)"
          className="shadow-sm"
        />
      </ReactFlow>

      {/* Add State dialog */}
      <Dialog open={addStateOpen} onOpenChange={setAddStateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add State</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={addStateLabel}
                onChange={e => setAddStateLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddState()}
                className="h-8 text-xs font-mono"
                placeholder="STATE_LABEL"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kind</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {KIND_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setAddStateKind(opt.value)}
                    className={cn(
                      'text-xs py-1.5 px-2 rounded border transition-colors',
                      addStateKind === opt.value
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
                value={addStateDesc}
                onChange={e => setAddStateDesc(e.target.value)}
                className="h-8 text-xs"
                placeholder="What does this state mean?"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setAddStateOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAddState} disabled={!addStateLabel.trim()}>Add State</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Transition dialog */}
      <Dialog open={addTransitionOpen} onOpenChange={setAddTransitionOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add Transition</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs">Action</Label>
              <Input
                value={addTransitionAction}
                onChange={e => setAddTransitionAction(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTransition()}
                className="h-8 text-xs"
                placeholder="e.g. Submit, Approve, Request Changes"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <select
                  value={addTransitionFrom}
                  onChange={e => setAddTransitionFrom(e.target.value)}
                  className="w-full h-8 text-xs rounded-md border border-slate-200 px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  {(editedWorkflow?.states ?? []).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <select
                  value={addTransitionTo}
                  onChange={e => setAddTransitionTo(e.target.value)}
                  className="w-full h-8 text-xs rounded-md border border-slate-200 px-2 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                >
                  {(editedWorkflow?.states ?? []).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setAddTransitionOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleAddTransition}
                disabled={!addTransitionAction.trim() || !addTransitionFrom || !addTransitionTo}
              >
                Add Transition
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
