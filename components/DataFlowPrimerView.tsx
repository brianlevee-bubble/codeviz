"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  MousePointer2, Zap, Server, GitBranch, Database,
  ArrowLeftRight, Layers, Monitor, Shield,
  ChevronLeft, ChevronRight, X, Loader2, AlertCircle,
  RefreshCw, Search, Info,
} from "lucide-react";
import { useGraphStore } from "@/lib/store/graph-store";

// ─── Types ────────────────────────────────────────────────────────────────────

type UserAction = {
  id: string;
  label: string;
  description: string;
  trigger: string;
  file: string;
};

type FlowNode = {
  id: string;
  type: "userAction" | "apiCall" | "serverAction" | "validation" | "database" | "response" | "stateUpdate" | "display";
  label: string;
  description: string;
  code?: string;
  file?: string;
  nextId?: string | null;
};

// ─── Node styling by type ─────────────────────────────────────────────────────

const NODE_CONFIG: Record<FlowNode["type"], {
  icon: React.ElementType;
  borderColor: string;
  badgeBg: string;
  glowColor: string;
}> = {
  userAction:   { icon: MousePointer2,  borderColor: "border-slate-400",   badgeBg: "bg-slate-500",   glowColor: "#94a3b8" },
  apiCall:      { icon: Zap,            borderColor: "border-blue-400",    badgeBg: "bg-blue-500",    glowColor: "#60a5fa" },
  serverAction: { icon: Server,         borderColor: "border-indigo-400",  badgeBg: "bg-indigo-500",  glowColor: "#818cf8" },
  validation:   { icon: Shield,         borderColor: "border-violet-400",  badgeBg: "bg-violet-500",  glowColor: "#a78bfa" },
  database:     { icon: Database,       borderColor: "border-emerald-400", badgeBg: "bg-emerald-500", glowColor: "#34d399" },
  response:     { icon: ArrowLeftRight, borderColor: "border-teal-400",    badgeBg: "bg-teal-500",    glowColor: "#2dd4bf" },
  stateUpdate:  { icon: Layers,         borderColor: "border-amber-400",   badgeBg: "bg-amber-500",   glowColor: "#fbbf24" },
  display:      { icon: Monitor,        borderColor: "border-rose-400",    badgeBg: "bg-rose-500",    glowColor: "#fb7185" },
};

const TYPE_LABELS: Record<FlowNode["type"], string> = {
  userAction:   "User Action",
  apiCall:      "API Call",
  serverAction: "Server Action",
  validation:   "Validation",
  database:     "Database",
  response:     "Response",
  stateUpdate:  "State Update",
  display:      "Display",
};

// ─── React Flow custom node ───────────────────────────────────────────────────

type FlowNodeData = FlowNode & { active: boolean; stepNum: number; totalSteps: number };

function TraceNode({ data }: NodeProps) {
  const d = data as unknown as FlowNodeData;
  const cfg = NODE_CONFIG[d.type] ?? NODE_CONFIG.userAction;
  const Icon = cfg.icon;

  return (
    <div
      className={`relative w-56 rounded-xl border-2 ${cfg.borderColor} bg-slate-900 shadow-xl cursor-pointer transition-all duration-200 ${d.active ? "scale-105" : "hover:scale-[1.02]"}`}
      style={d.active ? { boxShadow: `0 0 24px 4px ${cfg.glowColor}55` } : undefined}
    >
      <Handle type="target" position={Position.Left}  className="!bg-slate-600 !border-slate-500 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} className="!bg-slate-600 !border-slate-500 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Top}   className="!bg-slate-600 !border-slate-500 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-slate-600 !border-slate-500 !w-2.5 !h-2.5" />

      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl opacity-80" style={{ backgroundColor: cfg.glowColor }} />

      <div className="p-3.5 pt-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="rounded-lg p-1.5 shrink-0" style={{ backgroundColor: `${cfg.glowColor}22`, border: `1px solid ${cfg.glowColor}44` }}>
            <Icon className="w-4 h-4" style={{ color: cfg.glowColor }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white font-semibold text-sm leading-tight truncate">{d.label}</div>
            <div className="text-slate-400 text-[11px]">{TYPE_LABELS[d.type]}</div>
          </div>
          <div className={`shrink-0 ${cfg.badgeBg} text-white font-mono text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center`}>
            {d.stepNum}
          </div>
        </div>

        {d.code && (
          <div className="bg-slate-950 rounded-lg p-2.5 font-mono text-[10px] text-slate-300 leading-relaxed whitespace-pre overflow-hidden border border-slate-700/60 max-h-20">
            {d.code.slice(0, 200)}
          </div>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES = { trace: TraceNode };

// ─── Build React Flow graph from linear chain ─────────────────────────────────

const X_GAP = 270;
const ROW2_Y = 230;

function buildFlowGraph(flowNodes: FlowNode[], activeStep: number | null): { nodes: Node[]; edges: Edge[] } {
  const total = flowNodes.length;
  const nodes: Node[] = flowNodes.map((fn, i) => {
    const row = i < Math.ceil(total / 2) ? 0 : 1;
    const col = row === 0 ? i : total - 1 - i;
    const cfg = NODE_CONFIG[fn.type] ?? NODE_CONFIG.userAction;
    const isActive = activeStep !== null && i + 1 === activeStep;

    return {
      id: fn.id,
      type: "trace",
      position: { x: col * X_GAP, y: row === 0 ? 0 : ROW2_Y },
      data: { ...fn, active: isActive, stepNum: i + 1, totalSteps: total },
      draggable: true,
    };
  });

  const edges: Edge[] = flowNodes.slice(0, -1).map((fn, i) => {
    const next = flowNodes[i + 1];
    const cfg = NODE_CONFIG[fn.type] ?? NODE_CONFIG.userAction;
    const isActive = activeStep !== null && i + 1 < activeStep;

    return {
      id: `e${i}`,
      source: fn.id,
      target: next.id,
      animated: true,
      style: { stroke: isActive ? cfg.glowColor : "#334155", strokeWidth: isActive ? 2.5 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: isActive ? cfg.glowColor : "#334155", width: 14, height: 14 },
    };
  });

  return { nodes, edges };
}

// ─── SSE helper ──────────────────────────────────────────────────────────────

async function readSSE(
  url: string,
  onEvent: (ev: Record<string, unknown>) => void
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try { onEvent(JSON.parse(line.slice(6))); } catch { /* skip */ }
    }
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const ACTIONS_CACHE_KEY = (p: string) => `codeviz_df_actions_v1_${btoa(p)}`;
const TRACE_CACHE_KEY   = (p: string, id: string) => `codeviz_df_trace_v1_${btoa(p + id)}`;

function getCached<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}
function setCached(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* quota */ }
}

// ─── Trigger badge ────────────────────────────────────────────────────────────

const TRIGGER_COLORS: Record<string, string> = {
  onClick: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  onSubmit: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "server action": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "form action": "bg-teal-500/20 text-teal-300 border-teal-500/30",
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function DataFlowPrimerView() {
  const { directoryPath } = useGraphStore();

  // Discovery
  const [discoverPhase, setDiscoverPhase] = useState<"idle" | "scanning" | "analyzing" | "done" | "error">("idle");
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [actions, setActions] = useState<UserAction[]>([]);
  const loadedForPath = useRef<string | null>(null);

  // Selected action + trace
  const [selectedAction, setSelectedAction] = useState<UserAction | null>(null);
  const [tracePhase, setTracePhase] = useState<"idle" | "scanning" | "reading" | "tracing" | "done" | "error">("idle");
  const [traceError, setTraceError] = useState<string | null>(null);
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);

  // Step nav
  const [activeStep, setActiveStep] = useState<number | null>(null);

  // React Flow
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // ── Discover actions ────────────────────────────────────────────────────────

  const discoverActions = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached<UserAction[]>(ACTIONS_CACHE_KEY(dirPath));
      if (cached && cached.length > 0) {
        setActions(cached);
        setDiscoverPhase("done");
        return;
      }
    }

    setDiscoverPhase("scanning");
    setDiscoverError(null);
    setActions([]);
    setSelectedAction(null);
    setFlowNodes([]);
    setTracePhase("idle");

    try {
      await readSSE(
        `/api/data-flow-actions?path=${encodeURIComponent(dirPath)}`,
        (ev) => {
          if (ev.phase === "scanning") setDiscoverPhase("scanning");
          else if (ev.phase === "analyzing") setDiscoverPhase("analyzing");
          else if (ev.phase === "complete") {
            const list = (ev.actions as UserAction[]) ?? [];
            setCached(ACTIONS_CACHE_KEY(dirPath), list);
            setActions(list);
            setDiscoverPhase("done");
          } else if (ev.phase === "error") {
            setDiscoverError(ev.error as string);
            setDiscoverPhase("error");
          }
        }
      );
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : "Failed");
      setDiscoverPhase("error");
    }
  }, []);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      discoverActions(directoryPath);
    }
  }, [directoryPath, discoverActions]);

  // ── Trace selected action ────────────────────────────────────────────────────

  const traceAction = useCallback(async (action: UserAction, force = false) => {
    if (!directoryPath) return;

    setSelectedAction(action);
    setActiveStep(null);

    if (!force) {
      const cached = getCached<FlowNode[]>(TRACE_CACHE_KEY(directoryPath, action.id));
      if (cached && cached.length > 0) {
        setFlowNodes(cached);
        const { nodes: n, edges: e } = buildFlowGraph(cached, null);
        setNodes(n); setEdges(e);
        setTracePhase("done");
        return;
      }
    }

    setTracePhase("scanning");
    setTraceError(null);
    setFlowNodes([]);

    try {
      const params = new URLSearchParams({
        path: directoryPath,
        file: action.file,
        label: action.label,
        description: action.description,
      });

      await readSSE(
        `/api/data-flow-trace?${params}`,
        (ev) => {
          if (ev.phase === "scanning") setTracePhase("scanning");
          else if (ev.phase === "reading") setTracePhase("reading");
          else if (ev.phase === "tracing") setTracePhase("tracing");
          else if (ev.phase === "complete") {
            const traced = (ev.nodes as FlowNode[]) ?? [];
            setCached(TRACE_CACHE_KEY(directoryPath, action.id), traced);
            setFlowNodes(traced);
            const { nodes: n, edges: e } = buildFlowGraph(traced, null);
            setNodes(n); setEdges(e);
            setTracePhase("done");
          } else if (ev.phase === "error") {
            setTraceError(ev.error as string);
            setTracePhase("error");
          }
        }
      );
    } catch (err) {
      setTraceError(err instanceof Error ? err.message : "Failed");
      setTracePhase("error");
    }
  }, [directoryPath, setNodes, setEdges]);

  // ── Step nav ─────────────────────────────────────────────────────────────────

  const goTo = useCallback((step: number | null) => {
    setActiveStep(step);
    const { nodes: n, edges: e } = buildFlowGraph(flowNodes, step);
    setNodes(n); setEdges(e);
  }, [flowNodes, setNodes, setEdges]);

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    const step = (node.data as FlowNodeData).stepNum;
    goTo(activeStep === step ? null : step);
  }, [activeStep, goTo]);

  const selectedStage = activeStep !== null ? flowNodes[activeStep - 1] : null;
  const selectedCfg = selectedStage ? NODE_CONFIG[selectedStage.type] ?? NODE_CONFIG.userAction : null;

  // ── Discovery loading states ──────────────────────────────────────────────────

  if (discoverPhase === "idle" || discoverPhase === "scanning" || discoverPhase === "analyzing") {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
          <p className="text-sm">
            {discoverPhase === "analyzing" ? "Identifying user actions…" : "Scanning for interactions…"}
          </p>
        </div>
      </div>
    );
  }

  if (discoverPhase === "error") {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400 max-w-sm text-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-sm">{discoverError}</p>
          <button
            onClick={() => directoryPath && discoverActions(directoryPath, true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm border border-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (discoverPhase === "done" && actions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3 text-slate-400 max-w-xs text-center">
          <Search className="w-10 h-10 text-slate-600" />
          <p className="text-sm font-medium text-slate-300">No user actions found</p>
          <p className="text-xs leading-relaxed">
            CodeViz looks for onClick handlers, form submits, and server actions in your TypeScript files.
          </p>
          <button
            onClick={() => directoryPath && discoverActions(directoryPath, true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm border border-slate-700 mt-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-scan
          </button>
        </div>
      </div>
    );
  }

  // ── Trace loading ────────────────────────────────────────────────────────────

  const isTracing = tracePhase === "scanning" || tracePhase === "reading" || tracePhase === "tracing";

  const traceStatusLabel = {
    scanning: "Scanning files…",
    reading:  "Reading source…",
    tracing:  "Tracing data flow…",
  }[tracePhase as "scanning" | "reading" | "tracing"] ?? "";

  // ── Rendered layout ───────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-slate-950">

      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-white/8 bg-slate-900/60 shrink-0">
        <div className="shrink-0">
          <h2 className="text-white font-semibold text-sm">Data Flow</h2>
          <p className="text-slate-400 text-xs">Select a user action to trace its full data flow</p>
        </div>

        {/* Action picker */}
        <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {actions.map((action) => {
            const isSelected = selectedAction?.id === action.id;
            return (
              <button
                key={action.id}
                onClick={() => traceAction(action)}
                disabled={isTracing}
                className={`shrink-0 flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left transition-all ${
                  isSelected
                    ? "bg-indigo-600/20 border-indigo-500/60 text-white"
                    : "bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:border-slate-600 hover:text-white"
                } disabled:opacity-50`}
              >
                <span className="text-xs font-medium">{action.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${TRIGGER_COLORS[action.trigger] ?? "bg-slate-700 text-slate-400 border-slate-600"}`}>
                  {action.trigger}
                </span>
              </button>
            );
          })}
        </div>

        {/* Re-scan */}
        <button
          onClick={() => directoryPath && discoverActions(directoryPath, true)}
          className="shrink-0 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700"
          title="Re-scan actions"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Step nav bar — shown when a trace is loaded */}
      {tracePhase === "done" && flowNodes.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 border-b border-white/8 bg-slate-900/40 shrink-0">
          {activeStep === null ? (
            <button
              onClick={() => goTo(1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              Step through <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button
                onClick={() => goTo(activeStep > 1 ? activeStep - 1 : null)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs min-w-[140px] justify-center">
                <span className="text-slate-400 font-mono">{activeStep}/{flowNodes.length}</span>
                <span className="text-white font-medium truncate">{flowNodes[activeStep - 1]?.label}</span>
              </div>
              <button
                onClick={() => goTo(activeStep < flowNodes.length ? activeStep + 1 : null)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition-colors"
              >
                {activeStep < flowNodes.length ? "Next" : "Done"} <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => goTo(null)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {flowNodes.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(activeStep === i + 1 ? null : i + 1)}
                className={`w-5 h-5 rounded-full text-[9px] font-mono font-bold transition-all ${
                  activeStep === i + 1
                    ? "bg-white text-slate-900 scale-110"
                    : "bg-slate-800 text-slate-500 hover:bg-slate-700"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Main area */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* Centered states (no ReactFlow) */}
          {(!selectedAction || isTracing || tracePhase === "error") && (
            <div className="flex-1 flex items-center justify-center">
              {!selectedAction && (
                <div className="text-center text-slate-500">
                  <GitBranch className="w-12 h-12 mx-auto mb-3 text-slate-700" />
                  <p className="text-sm">Select an action above to trace its data flow</p>
                </div>
              )}
              {isTracing && (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                  <p className="text-slate-300 text-sm">{traceStatusLabel}</p>
                </div>
              )}
              {tracePhase === "error" && (
                <div className="flex flex-col items-center gap-3 text-slate-400 text-center max-w-sm">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <p className="text-sm">{traceError}</p>
                  {selectedAction && (
                    <button
                      onClick={() => traceAction(selectedAction, true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm border border-slate-700"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {tracePhase === "done" && flowNodes.length > 0 && (
            <div className="flex-1">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={handleNodeClick}
                nodeTypes={NODE_TYPES}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                minZoom={0.25}
                maxZoom={2}
                colorMode="dark"
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="#1e293b" />
                <Controls className="!bg-slate-800 !border-slate-700 !rounded-xl" showInteractive={false} />
              </ReactFlow>
            </div>
          )}
        </div>

        {/* Detail sidebar */}
        {selectedStage && selectedCfg && (
          <div className="w-72 border-l border-slate-800 bg-slate-900 overflow-y-auto shrink-0">
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-xl p-2.5 shrink-0" style={{ backgroundColor: `${selectedCfg.glowColor}20`, border: `1px solid ${selectedCfg.glowColor}40` }}>
                  <selectedCfg.icon className="w-5 h-5" style={{ color: selectedCfg.glowColor }} />
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{selectedStage.label}</div>
                  <div className="text-slate-400 text-xs">{TYPE_LABELS[selectedStage.type]} · Step {activeStep} of {flowNodes.length}</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <p className="text-slate-300 text-sm leading-relaxed">{selectedStage.description}</p>
              </div>

              {selectedStage.code && (
                <div className="mb-4">
                  <div className="text-slate-500 text-[10px] font-mono uppercase tracking-widest mb-2">Code</div>
                  <pre className="bg-slate-950 rounded-lg p-3 font-mono text-[11px] text-slate-200 leading-relaxed overflow-x-auto border border-slate-700/60 whitespace-pre-wrap">
                    {selectedStage.code}
                  </pre>
                </div>
              )}

              {selectedStage.file && (
                <div className="text-[10px] font-mono text-slate-500 truncate px-1" title={selectedStage.file}>
                  {selectedStage.file}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
