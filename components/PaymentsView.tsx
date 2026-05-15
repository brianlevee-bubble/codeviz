'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  type Node, type Edge, type NodeTypes,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useGraphStore } from '@/lib/store/graph-store';
import { PaymentProviderNode, PaymentFlowNode } from '@/components/payments/PaymentProviderNode';
import type { PaymentsGraph, PaymentProviderConfig, PaymentProvider } from '@/lib/payments/types';
import {
  Loader2, AlertCircle, RefreshCw, X, Key, FileCode,
  Plus, Settings, CreditCard, Webhook, Package, ArrowRightLeft,
  ChevronDown, Shield, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES: NodeTypes = { paymentProvider: PaymentProviderNode as any, paymentFlow: PaymentFlowNode as any };

const PROVIDER_COLORS: Record<PaymentProvider, { bg: string; border: string; text: string; node: string }> = {
  stripe:        { bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700',  node: '#818cf8' },
  paypal:        { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',    node: '#60a5fa' },
  square:        { bg: 'bg-slate-50',   border: 'border-slate-300',  text: 'text-slate-700',   node: '#94a3b8' },
  braintree:     { bg: 'bg-sky-50',     border: 'border-sky-200',    text: 'text-sky-700',     node: '#38bdf8' },
  adyen:         { bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',   node: '#4ade80' },
  razorpay:      { bg: 'bg-cyan-50',    border: 'border-cyan-200',   text: 'text-cyan-700',    node: '#22d3ee' },
  mollie:        { bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700',  node: '#fb923c' },
  paddle:        { bg: 'bg-yellow-50',  border: 'border-yellow-200', text: 'text-yellow-700',  node: '#facc15' },
  lemonsqueezy:  { bg: 'bg-lime-50',    border: 'border-lime-200',   text: 'text-lime-700',    node: '#a3e635' },
  other:         { bg: 'bg-gray-50',    border: 'border-gray-200',   text: 'text-gray-700',    node: '#d1d5db' },
};

const FLOW_TYPE_COLORS: Record<string, string> = {
  checkout: '#818cf8',
  subscription: '#34d399',
  'one-time': '#fbbf24',
  invoice: '#a78bfa',
  marketplace: '#f97316',
  refund: '#f87171',
  payout: '#2dd4bf',
};

function buildGraph(graph: PaymentsGraph): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 120 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const provider of graph.providers) {
    const colors = PROVIDER_COLORS[provider.provider] ?? PROVIDER_COLORS.other;
    g.setNode(provider.id, { width: 240, height: 120 });
    nodes.push({
      id: provider.id,
      type: 'paymentProvider',
      position: { x: 0, y: 0 },
      data: {
        name: provider.name,
        provider: provider.provider,
        description: provider.description,
        webhookCount: provider.webhooks.length,
        productCount: provider.products.length,
        flowCount: provider.flows.length,
        status: provider.status,
        testMode: provider.testMode,
        color: colors.node,
      },
    });

    for (const flow of provider.flows) {
      const flowColor = FLOW_TYPE_COLORS[flow.type] ?? '#d1d5db';
      g.setNode(flow.id, { width: 200, height: 100 });
      nodes.push({
        id: flow.id,
        type: 'paymentFlow',
        position: { x: 0, y: 0 },
        data: {
          name: flow.name,
          type: flow.type,
          description: flow.description,
          stepCount: flow.steps.length,
          color: flowColor,
        },
      });

      edges.push({
        id: `e_${provider.id}_${flow.id}`,
        source: provider.id,
        target: flow.id,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: colors.node },
        style: { stroke: colors.node, strokeWidth: 1.5 },
      });
      g.setEdge(provider.id, flow.id);
    }
  }

  dagre.layout(g);

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
  provider, onClose,
}: {
  provider: PaymentProviderConfig;
  onClose: () => void;
}) {
  const colors = PROVIDER_COLORS[provider.provider] ?? PROVIDER_COLORS.other;
  const [expandedSection, setExpandedSection] = useState<string | null>('flows');

  const toggleSection = (section: string) =>
    setExpandedSection(prev => prev === section ? null : section);

  return (
    <div className="w-96 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900">{provider.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}>
                {provider.provider}
              </span>
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${
                provider.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                provider.status === 'inactive' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                'bg-red-50 text-red-700 border-red-200'
              }`}>
                {provider.status}
              </span>
              {provider.testMode && (
                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                  test mode
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-xs text-slate-600 leading-relaxed">{provider.description}</p>

        {provider.package && (
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Package className="h-3 w-3 shrink-0" />
            <span className="font-mono">{provider.package}{provider.version ? `@${provider.version}` : ''}</span>
          </div>
        )}

        {provider.docsUrl && (
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] text-blue-500 hover:text-blue-700"
          >
            <ExternalLink className="h-3 w-3" /> Documentation
          </a>
        )}

        {provider.currencies.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {provider.currencies.map((c, i) => (
              <span key={i} className="text-[9px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                {c}
              </span>
            ))}
          </div>
        )}

        {/* Payment Flows */}
        {provider.flows.length > 0 && (
          <div className="space-y-1.5">
            <button
              onClick={() => toggleSection('flows')}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
            >
              <span className="flex items-center gap-1">
                <ArrowRightLeft className="h-3 w-3" /> Payment Flows ({provider.flows.length})
              </span>
              <ChevronDown className={`h-3 w-3 transition-transform ${expandedSection === 'flows' ? 'rotate-180' : ''}`} />
            </button>
            {expandedSection === 'flows' && provider.flows.map((flow, i) => (
              <div key={i} className="text-[10px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-semibold text-slate-700">{flow.name}</span>
                  <span className={`text-[8px] font-medium px-1 py-0.5 rounded text-white`}
                    style={{ backgroundColor: FLOW_TYPE_COLORS[flow.type] ?? '#d1d5db' }}>
                    {flow.type}
                  </span>
                </div>
                <p className="text-slate-500 mb-1">{flow.description}</p>
                <ol className="list-decimal list-inside space-y-0.5 text-slate-500">
                  {flow.steps.map((step, j) => (
                    <li key={j}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}

        {/* Webhooks */}
        {provider.webhooks.length > 0 && (
          <div className="space-y-1.5">
            <button
              onClick={() => toggleSection('webhooks')}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
            >
              <span className="flex items-center gap-1">
                <Webhook className="h-3 w-3" /> Webhooks ({provider.webhooks.length})
              </span>
              <ChevronDown className={`h-3 w-3 transition-transform ${expandedSection === 'webhooks' ? 'rotate-180' : ''}`} />
            </button>
            {expandedSection === 'webhooks' && provider.webhooks.map((wh, i) => (
              <div key={i} className="text-[10px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-purple-600">{wh.event}</span>
                </div>
                <p className="text-slate-500 mt-0.5">{wh.description}</p>
                <p className="text-slate-400 font-mono mt-0.5">{wh.path} &middot; {wh.file}</p>
              </div>
            ))}
          </div>
        )}

        {/* Products */}
        {provider.products.length > 0 && (
          <div className="space-y-1.5">
            <button
              onClick={() => toggleSection('products')}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
            >
              <span className="flex items-center gap-1">
                <Package className="h-3 w-3" /> Products ({provider.products.length})
              </span>
              <ChevronDown className={`h-3 w-3 transition-transform ${expandedSection === 'products' ? 'rotate-180' : ''}`} />
            </button>
            {expandedSection === 'products' && provider.products.map((prod, i) => (
              <div key={i} className="text-[10px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                <div className="flex-1">
                  <span className="font-medium text-slate-700">{prod.name}</span>
                  <span className={`ml-1.5 text-[8px] font-medium px-1 py-0.5 rounded-full ${
                    prod.type === 'recurring' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {prod.type}
                  </span>
                </div>
                <span className="font-mono text-slate-600 shrink-0">{prod.priceDescription}</span>
              </div>
            ))}
          </div>
        )}

        {/* Env Keys */}
        {provider.envKeys.length > 0 && (
          <div className="space-y-1.5">
            <button
              onClick={() => toggleSection('envKeys')}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
            >
              <span className="flex items-center gap-1">
                <Key className="h-3 w-3" /> Config Keys ({provider.envKeys.length})
              </span>
              <ChevronDown className={`h-3 w-3 transition-transform ${expandedSection === 'envKeys' ? 'rotate-180' : ''}`} />
            </button>
            {expandedSection === 'envKeys' && provider.envKeys.map((ek, i) => (
              <div key={i} className="text-[10px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                <span className="font-mono font-medium text-slate-700">{ek.key}</span>
                {ek.isSecret && <Shield className="h-3 w-3 text-amber-500 shrink-0" />}
                <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded-full ${
                  ek.isSet ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}>
                  {ek.isSet ? 'set' : 'missing'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Files */}
        {provider.files.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={() => toggleSection('files')}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
            >
              <span className="flex items-center gap-1">
                <FileCode className="h-3 w-3" /> Files ({provider.files.length})
              </span>
              <ChevronDown className={`h-3 w-3 transition-transform ${expandedSection === 'files' ? 'rotate-180' : ''}`} />
            </button>
            {expandedSection === 'files' && (
              <div className="space-y-0.5">
                {provider.files.map((f, i) => (
                  <p key={i} className="text-[10px] font-mono text-slate-500 truncate">{f}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Configure Dialog ────────────────────────────────────────────────────────

function ConfigureDialog({
  action, providerName, onSubmit, onCancel, isLoading, result,
}: {
  action: string;
  providerName: string;
  onSubmit: (details: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
}) {
  const [details, setDetails] = useState('');
  const labels: Record<string, string> = {
    'add': 'Add Payment Provider',
    'add-webhook': 'Add Webhook Handler',
    'add-product': 'Add Product / Plan',
    'add-flow': 'Add Payment Flow',
    'configure': 'Update Configuration',
  };
  const placeholders: Record<string, string> = {
    'add': 'e.g., Add Stripe with checkout sessions, subscription billing, and webhook handling',
    'add-webhook': 'e.g., Handle payment_intent.succeeded and charge.refunded events',
    'add-product': 'e.g., Add a Pro plan at $29/mo with annual discount at $290/yr',
    'add-flow': 'e.g., Add a checkout flow for one-time purchases with tax calculation',
    'configure': 'e.g., Switch to production keys, add webhook signing secret, enable 3D Secure',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">{labels[action] ?? action}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {action === 'add' ? 'Describe the payment provider to add' : `Configuring: ${providerName}`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!result && (
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">
                Details
              </label>
              {action === 'add' ? (
                <input
                  type="text"
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={placeholders[action]}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              ) : (
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder={placeholders[action]}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              )}
            </div>
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating configuration plan...
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">{result.summary}</p>

              {result.changes?.map((ch: { file: string; action: string; description: string }, i: number) => (
                <div key={i} className="text-[10px] border border-slate-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${
                      ch.action === 'create' ? 'text-green-600' :
                      ch.action === 'delete' ? 'text-red-600' :
                      'text-blue-600'
                    }`}>{ch.action.toUpperCase()}</span>
                    <span className="font-mono text-slate-700">{ch.file}</span>
                  </div>
                  <p className="text-slate-500 mt-0.5">{ch.description}</p>
                </div>
              ))}

              {result.packagesToInstall?.length > 0 && (
                <div className="text-[10px] text-slate-500">
                  <span className="font-semibold">Packages to install: </span>
                  {result.packagesToInstall.join(', ')}
                </div>
              )}

              {result.envVars?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-slate-500">Environment Variables:</p>
                  {result.envVars.map((ev: { key: string; description: string }, i: number) => (
                    <div key={i} className="text-[10px] bg-amber-50 border border-amber-100 rounded px-2 py-1">
                      <span className="font-mono font-medium text-amber-800">{ev.key}</span>
                      <span className="text-amber-600 ml-2">{ev.description}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          {!result ? (
            <Button size="sm" onClick={() => onSubmit(details)} disabled={isLoading || (!details.trim() && action === 'add')}>
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Generate Plan
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => onSubmit('__apply__')}
              disabled={isLoading}
            >
              Apply Changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_payments_v1_';
function getCached(dirPath: string): PaymentsGraph | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}
function setCached(dirPath: string, graph: PaymentsGraph) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(graph)); } catch { /* quota */ }
}
export function clearPaymentsCache(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function PaymentsView() {
  const { directoryPath } = useGraphStore();
  const [graph, setGraph] = useState<PaymentsGraph | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loadedForPath = useRef<string | null>(null);

  const [configAction, setConfigAction] = useState<string | null>(null);
  const [configTarget, setConfigTarget] = useState<string>('');
  const [configLoading, setConfigLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [configResult, setConfigResult] = useState<any>(null);

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
    setSelectedId(null);

    const res = await fetch(`/api/payments?path=${encodeURIComponent(dirPath)}`);
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
            const g = ev.graph as PaymentsGraph;
            setCached(dirPath, g);
            setGraph(g);
            const { nodes: n, edges: e } = buildGraph(g);
            setNodes(n); setEdges(e);
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

  const selectedProvider = graph?.providers.find(p => p.id === selectedId) ?? null;

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type === 'paymentProvider') setSelectedId(node.id);
    else setSelectedId(null);
  }, []);

  const handleAddNew = useCallback(() => {
    setConfigAction('add');
    setConfigTarget('');
    setConfigResult(null);
    setConfigLoading(false);
    setSelectedId(null);
  }, []);

  const handleConfigure = useCallback((action: string) => {
    setConfigAction(action);
    setConfigTarget(selectedProvider?.name ?? '');
    setConfigResult(null);
    setConfigLoading(false);
  }, [selectedProvider]);

  const handleConfigSubmit = useCallback(async (details: string) => {
    if (!directoryPath || !configAction) return;

    if (details === '__apply__' && configResult?.changes) {
      setConfigLoading(true);
      try {
        const res = await fetch('/api/payments/configure', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: directoryPath, changes: configResult.changes }),
        });
        if (res.ok) {
          setConfigAction(null);
          setConfigResult(null);
          clearPaymentsCache(directoryPath);
          loadedForPath.current = null;
          load(directoryPath, true);
        }
      } finally {
        setConfigLoading(false);
      }
      return;
    }

    setConfigLoading(true);
    try {
      const res = await fetch('/api/payments/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dirPath: directoryPath,
          action: configAction,
          providerName: configAction === 'add' ? details : configTarget,
          details,
        }),
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.phase === 'plan') {
              setConfigResult(ev.plan);
            }
          } catch { /* skip */ }
        }
      }
    } finally {
      setConfigLoading(false);
    }
  }, [directoryPath, configAction, configTarget, configResult, load]);

  // ── Loading states ─────────────────────────────────────────────────────────

  if (loadPhase === 'reading' || loadPhase === 'idle') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Reading codebase...</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'analyzing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full px-8">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-sm text-slate-600 font-medium">Analyzing payment systems...</p>
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

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 relative">
        {/* Stats bar */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 shadow-sm flex items-center gap-3">
            <span><span className="font-semibold text-indigo-600">{graph.providers.length}</span> providers</span>
            <span className="text-slate-300">&middot;</span>
            <span><span className="font-semibold text-green-600">{graph.summary.totalFlows}</span> flows</span>
            <span className="text-slate-300">&middot;</span>
            <span><span className="font-semibold text-purple-500">{graph.summary.totalWebhooks}</span> webhooks</span>
            <span className="text-slate-300">&middot;</span>
            <span><span className="font-semibold text-amber-500">{graph.summary.totalProducts}</span> products</span>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => directoryPath && load(directoryPath, true)}
            className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleAddNew}
            className="h-7 px-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="h-3 w-3 mr-1" /> Add Provider
          </Button>
        </div>

        {/* Missing env warning */}
        {graph.summary.missingEnvVars.length > 0 && (
          <div className="absolute top-14 left-3 z-10 bg-amber-50/95 backdrop-blur border border-amber-200 rounded-lg px-3 py-2 shadow-sm max-w-xs">
            <p className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Missing Payment Keys
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {graph.summary.missingEnvVars.slice(0, 5).map((v, i) => (
                <span key={i} className="text-[9px] font-mono bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                  {v}
                </span>
              ))}
              {graph.summary.missingEnvVars.length > 5 && (
                <span className="text-[9px] text-amber-600">+{graph.summary.missingEnvVars.length - 5} more</span>
              )}
            </div>
          </div>
        )}

        {/* Test mode warning */}
        {graph.summary.hasTestMode && (
          <div className="absolute top-3 right-48 z-10 bg-amber-50/95 backdrop-blur border border-amber-200 rounded-lg px-3 py-1.5 shadow-sm">
            <p className="text-[10px] font-medium text-amber-700 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Test mode detected
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <CreditCard className="h-3 w-3 text-indigo-500" />
              Provider
            </span>
            <span className="flex items-center gap-1">
              <ArrowRightLeft className="h-3 w-3 text-green-500" />
              Flow
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">Click a provider to configure</p>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={NODE_TYPES}
          onNodeClick={handleNodeClick}
          onPaneClick={() => setSelectedId(null)}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.15}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls className="shadow-sm" />
          <MiniMap
            nodeColor={(n) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (n.data as any)?.color ?? '#e5e7eb';
            }}
            maskColor="rgba(241,245,249,0.7)"
            className="shadow-sm"
          />
        </ReactFlow>

        {graph.providers.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-slate-400 space-y-2">
              <CreditCard className="h-8 w-8 mx-auto text-slate-300" />
              <p className="text-sm">No payment providers detected</p>
              <p className="text-xs">Click &ldquo;Add Provider&rdquo; to set up payments</p>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedProvider && (
        <DetailPanel
          provider={selectedProvider}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Config dialog */}
      {configAction && (
        <ConfigureDialog
          action={configAction}
          providerName={configTarget}
          onSubmit={handleConfigSubmit}
          onCancel={() => { setConfigAction(null); setConfigResult(null); }}
          isLoading={configLoading}
          result={configResult}
        />
      )}
    </div>
  );
}
