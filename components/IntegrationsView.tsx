'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  type Node, type Edge, type NodeTypes,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useGraphStore } from '@/lib/store/graph-store';
import { IntegrationNode } from '@/components/integrations/IntegrationNode';
import { IntegrationCategoryNode } from '@/components/integrations/IntegrationCategoryNode';
import type { IntegrationsGraph, Integration, IntegrationCategory } from '@/lib/integrations/types';
import {
  Loader2, AlertCircle, RefreshCw, X, FileCode, Key, Globe,
  Plus, Trash2, Plug, ExternalLink, Shield, Pencil, Check, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { IntegrationEndpoint, IntegrationConfig } from '@/lib/integrations/types';

const NODE_TYPES: NodeTypes = {
  integration: IntegrationNode,
  integrationCategory: IntegrationCategoryNode,
};

const CATEGORY_COLORS: Record<IntegrationCategory, { bg: string; border: string; text: string; node: string }> = {
  payment:    { bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-700',  node: '#e9d5ff' },
  auth:       { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',    node: '#bfdbfe' },
  email:      { bg: 'bg-pink-50',    border: 'border-pink-200',   text: 'text-pink-700',    node: '#fbcfe8' },
  storage:    { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',   node: '#fde68a' },
  analytics:  { bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700',   node: '#bbf7d0' },
  messaging:  { bg: 'bg-cyan-50',    border: 'border-cyan-200',   text: 'text-cyan-700',    node: '#a5f3fc' },
  database:   { bg: 'bg-orange-50',  border: 'border-orange-200', text: 'text-orange-700',  node: '#fed7aa' },
  api:        { bg: 'bg-slate-50',   border: 'border-slate-200',  text: 'text-slate-700',   node: '#cbd5e1' },
  monitoring: { bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700',     node: '#fecaca' },
  cdn:        { bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700', node: '#a7f3d0' },
  search:     { bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700',  node: '#c7d2fe' },
  ai:         { bg: 'bg-violet-50',  border: 'border-violet-200', text: 'text-violet-700',  node: '#ddd6fe' },
  other:      { bg: 'bg-gray-50',    border: 'border-gray-200',   text: 'text-gray-700',    node: '#e5e7eb' },
};

const CATEGORY_ICONS: Record<IntegrationCategory, string> = {
  payment: '💳', auth: '🔐', email: '📧', storage: '📦', analytics: '📊',
  messaging: '💬', database: '🗄️', api: '🌐', monitoring: '📡', cdn: '⚡',
  search: '🔍', ai: '🤖', other: '🔌',
};

function buildGraph(graph: IntegrationsGraph): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 });

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const byCategory = new Map<string, Integration[]>();
  for (const integ of graph.integrations) {
    const list = byCategory.get(integ.category) ?? [];
    list.push(integ);
    byCategory.set(integ.category, list);
  }

  for (const [cat, integs] of byCategory) {
    const catId = `cat_${cat}`;
    g.setNode(catId, { width: 160, height: 50 });
    nodes.push({
      id: catId,
      type: 'integrationCategory',
      position: { x: 0, y: 0 },
      data: {
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        icon: CATEGORY_ICONS[cat as IntegrationCategory] ?? '🔌',
        count: integs.length,
        color: CATEGORY_COLORS[cat as IntegrationCategory]?.node ?? '#e5e7eb',
      },
    });

    for (const integ of integs) {
      const w = 240, h = 120;
      g.setNode(integ.id, { width: w, height: h });
      nodes.push({
        id: integ.id,
        type: 'integration',
        position: { x: 0, y: 0 },
        data: {
          name: integ.name,
          category: integ.category,
          description: integ.description,
          endpointCount: integ.endpoints.length,
          configCount: integ.configKeys.length,
          fileCount: integ.files.length,
          status: integ.status,
          package: integ.package,
          color: CATEGORY_COLORS[integ.category]?.node ?? '#e5e7eb',
        },
      });

      edges.push({
        id: `e_${catId}_${integ.id}`,
        source: catId,
        target: integ.id,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: CATEGORY_COLORS[cat as IntegrationCategory]?.node ?? '#cbd5e1' },
        style: { stroke: CATEGORY_COLORS[cat as IntegrationCategory]?.node ?? '#cbd5e1', strokeWidth: 1.5 },
      });
      g.setEdge(catId, integ.id);
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cloneIntegration(i: Integration): Integration {
  return JSON.parse(JSON.stringify(i));
}

function buildChangeSummary(original: Integration, draft: Integration): string {
  const lines: string[] = [`Editing the "${original.name}" integration:`];

  if (draft.description !== original.description)
    lines.push(`- Changed description to: "${draft.description}"`);
  if (draft.status !== original.status)
    lines.push(`- Changed status from "${original.status}" to "${draft.status}"`);
  if (draft.package !== original.package)
    lines.push(`- Changed package from "${original.package}" to "${draft.package}"`);
  if (draft.version !== original.version)
    lines.push(`- Changed version to "${draft.version}"`);
  if (draft.docsUrl !== original.docsUrl)
    lines.push(`- Changed docs URL to "${draft.docsUrl}"`);

  // Endpoints
  const origEps = original.endpoints.map(e => `${e.method} ${e.path}`);
  const draftEps = draft.endpoints.map(e => `${e.method} ${e.path}`);
  for (const ep of draft.endpoints) {
    const key = `${ep.method} ${ep.path}`;
    if (!origEps.includes(key)) lines.push(`- Added endpoint: ${ep.method} ${ep.path} — ${ep.description} (file: ${ep.file})`);
  }
  for (const ep of original.endpoints) {
    const key = `${ep.method} ${ep.path}`;
    if (!draftEps.includes(key)) lines.push(`- Removed endpoint: ${ep.method} ${ep.path}`);
  }
  // Modified endpoints
  for (const dEp of draft.endpoints) {
    const oEp = original.endpoints.find(e => e.method === dEp.method && e.path === dEp.path);
    if (oEp) {
      if (oEp.description !== dEp.description) lines.push(`- Updated endpoint ${dEp.method} ${dEp.path} description to: "${dEp.description}"`);
      if (oEp.file !== dEp.file) lines.push(`- Moved endpoint ${dEp.method} ${dEp.path} to file: ${dEp.file}`);
    }
  }

  // Config keys
  const origKeys = original.configKeys.map(c => c.key);
  const draftKeys = draft.configKeys.map(c => c.key);
  for (const ck of draft.configKeys) {
    if (!origKeys.includes(ck.key)) lines.push(`- Added config key: ${ck.key}${ck.isSecret ? ' (secret)' : ''}`);
  }
  for (const ck of original.configKeys) {
    if (!draftKeys.includes(ck.key)) lines.push(`- Removed config key: ${ck.key}`);
  }

  return lines.join('\n');
}

// ─── Edit panel sub-components ────────────────────────────────────────────────

function EndpointEditor({
  endpoint, onChange, onRemove,
}: { endpoint: IntegrationEndpoint; onChange: (ep: IntegrationEndpoint) => void; onRemove: () => void }) {
  const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'WEBHOOK', 'SDK_CALL'];
  return (
    <div className="border border-slate-200 rounded-lg p-2 space-y-1.5 bg-slate-50">
      <div className="flex items-center gap-1.5">
        <select
          value={endpoint.method}
          onChange={e => onChange({ ...endpoint, method: e.target.value })}
          className="text-[10px] font-mono font-bold border border-slate-200 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
        >
          {METHODS.map(m => <option key={m}>{m}</option>)}
        </select>
        <input
          value={endpoint.path}
          onChange={e => onChange({ ...endpoint, path: e.target.value })}
          placeholder="/api/path or sdk.method"
          className="flex-1 text-[10px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 shrink-0 p-0.5 rounded hover:bg-red-50">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <input
        value={endpoint.description}
        onChange={e => onChange({ ...endpoint, description: e.target.value })}
        placeholder="What does this endpoint do?"
        className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
      />
      <input
        value={endpoint.file}
        onChange={e => onChange({ ...endpoint, file: e.target.value })}
        placeholder="relative/file/path.ts"
        className="w-full text-[10px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-300"
      />
    </div>
  );
}

function ConfigKeyEditor({
  ck, onChange, onRemove,
}: { ck: IntegrationConfig; onChange: (c: IntegrationConfig) => void; onRemove: () => void }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2 space-y-1.5 bg-slate-50">
      <div className="flex items-center gap-1.5">
        <input
          value={ck.key}
          onChange={e => onChange({ ...ck, key: e.target.value })}
          placeholder="ENV_VAR_NAME"
          className="flex-1 text-[10px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        <button
          onClick={() => onChange({ ...ck, isSecret: !ck.isSecret })}
          title={ck.isSecret ? 'Mark as non-secret' : 'Mark as secret'}
          className={`p-0.5 rounded shrink-0 ${ck.isSecret ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-slate-500'}`}
        >
          <Shield className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 shrink-0 p-0.5 rounded hover:bg-red-50">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <input
        value={ck.value}
        onChange={e => onChange({ ...ck, value: e.target.value })}
        placeholder={ck.isSecret ? '*** (placeholder, not real value)' : 'default or example value'}
        className="w-full text-[10px] font-mono border border-slate-200 rounded px-1.5 py-0.5 bg-white text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-300"
      />
    </div>
  );
}

// ─── Plan preview ─────────────────────────────────────────────────────────────

function PlanPreview({
  plan, loading, onApply, onDiscard,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}: { plan: any; loading: boolean; onApply: () => void; onDiscard: () => void }) {
  return (
    <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">Change Plan</p>
        <button onClick={onDiscard} className="text-slate-400 hover:text-slate-600 p-0.5 rounded">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[10px] text-slate-500 py-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Generating plan...
        </div>
      )}

      {plan && !loading && (
        <>
          <p className="text-[10px] text-slate-600">{plan.summary}</p>

          <div className="space-y-1 max-h-36 overflow-y-auto">
            {plan.changes?.map((ch: { file: string; action: string; description: string }, i: number) => (
              <div key={i} className="text-[9px] bg-white border border-slate-100 rounded px-2 py-1">
                <span className={`font-bold mr-1.5 ${
                  ch.action === 'create' ? 'text-green-600' :
                  ch.action === 'delete' ? 'text-red-600' : 'text-blue-600'
                }`}>{ch.action.toUpperCase()}</span>
                <span className="font-mono text-slate-600">{ch.file}</span>
                <p className="text-slate-400 mt-0.5">{ch.description}</p>
              </div>
            ))}
          </div>

          {plan.packagesToInstall?.length > 0 && (
            <p className="text-[9px] text-slate-500">
              <span className="font-semibold">Install: </span>{plan.packagesToInstall.join(', ')}
            </p>
          )}

          {plan.envVars?.length > 0 && (
            <div className="space-y-0.5">
              {plan.envVars.map((ev: { key: string; description: string }, i: number) => (
                <div key={i} className="text-[9px] bg-amber-50 border border-amber-100 rounded px-2 py-0.5">
                  <span className="font-mono font-medium text-amber-800">{ev.key}</span>
                  <span className="text-amber-600 ml-1.5">{ev.description}</span>
                </div>
              ))}
            </div>
          )}

          <Button
            size="sm"
            className="w-full h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
            onClick={onApply}
          >
            <Check className="h-3.5 w-3.5 mr-1" /> Apply to codebase
          </Button>
        </>
      )}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  integration, onClose, onRemove, directoryPath, onApplied,
}: {
  integration: Integration;
  onClose: () => void;
  onRemove: () => void;
  directoryPath: string;
  onApplied: () => void;
}) {
  const colors = CATEGORY_COLORS[integration.category];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Integration>(() => cloneIntegration(integration));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [plan, setPlan] = useState<any>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  // Reset draft when the underlying integration changes (e.g. after refresh)
  useEffect(() => {
    setDraft(cloneIntegration(integration));
    setEditing(false);
    setPlan(null);
  }, [integration.id]);

  function startEdit() { setDraft(cloneIntegration(integration)); setEditing(true); setPlan(null); }
  function cancelEdit() { setEditing(false); setPlan(null); }

  function updateEndpoint(i: number, ep: IntegrationEndpoint) {
    const eps = [...draft.endpoints];
    eps[i] = ep;
    setDraft({ ...draft, endpoints: eps });
  }
  function removeEndpoint(i: number) {
    setDraft({ ...draft, endpoints: draft.endpoints.filter((_, j) => j !== i) });
  }
  function addEndpoint() {
    setDraft({ ...draft, endpoints: [...draft.endpoints, { method: 'GET', path: '', file: '', description: '' }] });
  }

  function updateConfigKey(i: number, ck: IntegrationConfig) {
    const cks = [...draft.configKeys];
    cks[i] = ck;
    setDraft({ ...draft, configKeys: cks });
  }
  function removeConfigKey(i: number) {
    setDraft({ ...draft, configKeys: draft.configKeys.filter((_, j) => j !== i) });
  }
  function addConfigKey() {
    setDraft({ ...draft, configKeys: [...draft.configKeys, { key: '', value: '', file: '', isSecret: false }] });
  }

  async function generatePlan() {
    const summary = buildChangeSummary(integration, draft);
    setPlanLoading(true);
    setPlan(null);
    try {
      const res = await fetch('/api/integrations/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath: directoryPath, action: 'update-config', integrationName: integration.name, details: summary }),
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
            if (ev.phase === 'plan') setPlan(ev.plan);
          } catch { /* skip */ }
        }
      }
    } finally {
      setPlanLoading(false);
    }
  }

  async function applyPlan() {
    if (!plan?.changes) return;
    setApplying(true);
    try {
      const res = await fetch('/api/integrations/modify', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath: directoryPath, changes: plan.changes }),
      });
      if (res.ok) {
        setEditing(false);
        setPlan(null);
        onApplied();
      }
    } finally {
      setApplying(false);
    }
  }

  const hasChanges = editing && JSON.stringify(draft) !== JSON.stringify(integration);

  return (
    <div className="w-[420px] shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg shrink-0">{CATEGORY_ICONS[integration.category]}</span>
          <div className="min-w-0">
            {editing ? (
              <input
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                className="text-sm font-semibold text-slate-900 border-b border-blue-300 bg-transparent focus:outline-none w-full"
              />
            ) : (
              <p className="text-sm font-semibold text-slate-900 truncate">{integration.name}</p>
            )}
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text} ${colors.border} border`}>
                {integration.category}
              </span>
              {editing ? (
                <div className="flex gap-1">
                  {(['active', 'unused', 'misconfigured'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setDraft({ ...draft, status: s })}
                      className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border transition-colors ${
                        draft.status === s
                          ? s === 'active' ? 'bg-green-100 text-green-700 border-green-300' :
                            s === 'unused' ? 'bg-slate-100 text-slate-600 border-slate-300' :
                            'bg-red-100 text-red-700 border-red-300'
                          : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                      }`}
                    >{s}</button>
                  ))}
                </div>
              ) : (
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${
                  integration.status === 'active' ? 'bg-green-50 text-green-700 border-green-200' :
                  integration.status === 'unused' ? 'bg-slate-50 text-slate-500 border-slate-200' :
                  'bg-red-50 text-red-700 border-red-200'
                }`}>{integration.status}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {editing ? (
            <>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={cancelEdit}>Cancel</Button>
              <Button
                size="sm"
                className="h-6 px-2 text-[10px] bg-blue-600 hover:bg-blue-700 text-white"
                onClick={generatePlan}
                disabled={!hasChanges || planLoading}
              >
                {planLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Generate Changes
              </Button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300 px-2 py-1 rounded-lg transition-colors"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 ml-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Description */}
        {editing ? (
          <textarea
            value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            placeholder="What does this integration do in the app?"
            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 h-16 resize-none text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        ) : (
          <p className="text-xs text-slate-600 leading-relaxed">{integration.description}</p>
        )}

        {/* Package / version / docs */}
        {editing ? (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Package</p>
            <div className="flex gap-1.5">
              <input
                value={draft.package ?? ''}
                onChange={e => setDraft({ ...draft, package: e.target.value || undefined })}
                placeholder="npm-package-name"
                className="flex-1 text-[10px] font-mono border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <input
                value={draft.version ?? ''}
                onChange={e => setDraft({ ...draft, version: e.target.value || undefined })}
                placeholder="version"
                className="w-20 text-[10px] font-mono border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>
            <input
              value={draft.docsUrl ?? ''}
              onChange={e => setDraft({ ...draft, docsUrl: e.target.value || undefined })}
              placeholder="https://docs.example.com"
              className="w-full text-[10px] border border-slate-200 rounded px-2 py-1 bg-white text-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          </div>
        ) : (
          <>
            {integration.package && (
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <Plug className="h-3 w-3 shrink-0" />
                <span className="font-mono">{integration.package}{integration.version ? `@${integration.version}` : ''}</span>
              </div>
            )}
            {integration.docsUrl && (
              <a href={integration.docsUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] text-blue-500 hover:text-blue-700">
                <ExternalLink className="h-3 w-3" /> Documentation
              </a>
            )}
          </>
        )}

        {/* Endpoints */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Globe className="h-3 w-3" /> Endpoints ({(editing ? draft : integration).endpoints.length})
            </p>
            {editing && (
              <button onClick={addEndpoint} className="flex items-center gap-0.5 text-[9px] text-blue-500 hover:text-blue-700">
                <Plus className="h-3 w-3" /> Add
              </button>
            )}
          </div>
          {editing ? (
            draft.endpoints.length === 0
              ? <p className="text-[10px] text-slate-400 italic">No endpoints — click Add to create one</p>
              : draft.endpoints.map((ep, i) => (
                <EndpointEditor key={i} endpoint={ep} onChange={ep => updateEndpoint(i, ep)} onRemove={() => removeEndpoint(i)} />
              ))
          ) : (
            integration.endpoints.map((ep, i) => (
              <div key={i} className="text-[10px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-bold ${
                    ep.method === 'GET' ? 'text-green-600' : ep.method === 'POST' ? 'text-blue-600' :
                    ep.method === 'DELETE' ? 'text-red-600' : ep.method === 'WEBHOOK' ? 'text-purple-600' : 'text-slate-600'
                  }`}>{ep.method}</span>
                  <span className="font-mono text-slate-700 truncate">{ep.path}</span>
                </div>
                <p className="text-slate-500 mt-0.5">{ep.description}</p>
                <p className="text-slate-400 font-mono mt-0.5">{ep.file}</p>
              </div>
            ))
          )}
        </div>

        {/* Config Keys */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Key className="h-3 w-3" /> Config Keys ({(editing ? draft : integration).configKeys.length})
            </p>
            {editing && (
              <button onClick={addConfigKey} className="flex items-center gap-0.5 text-[9px] text-blue-500 hover:text-blue-700">
                <Plus className="h-3 w-3" /> Add
              </button>
            )}
          </div>
          {editing ? (
            draft.configKeys.length === 0
              ? <p className="text-[10px] text-slate-400 italic">No config keys — click Add to create one</p>
              : draft.configKeys.map((ck, i) => (
                <ConfigKeyEditor key={i} ck={ck} onChange={ck => updateConfigKey(i, ck)} onRemove={() => removeConfigKey(i)} />
              ))
          ) : (
            integration.configKeys.map((ck, i) => (
              <div key={i} className="text-[10px] bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                <span className="font-mono font-medium text-slate-700">{ck.key}</span>
                {ck.isSecret && <Shield className="h-3 w-3 text-amber-500 shrink-0" />}
                <span className="text-slate-400 font-mono ml-auto truncate max-w-[80px]">{ck.value}</span>
              </div>
            ))
          )}
        </div>

        {/* Files */}
        {integration.files.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <FileCode className="h-3 w-3" /> Files ({integration.files.length})
            </p>
            <div className="space-y-0.5">
              {integration.files.map((f, i) => (
                <p key={i} className="text-[10px] font-mono text-slate-500 truncate">{f}</p>
              ))}
            </div>
          </div>
        )}

        {/* Remove */}
        {!editing && (
          <div className="pt-2 border-t border-slate-100">
            <button
              onClick={onRemove}
              className="flex items-center gap-1.5 text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
            >
              <Trash2 className="h-3 w-3" /> Remove integration
            </button>
          </div>
        )}
      </div>

      {/* Plan preview */}
      {(plan || planLoading) && (
        <PlanPreview
          plan={plan}
          loading={planLoading || applying}
          onApply={applyPlan}
          onDiscard={() => setPlan(null)}
        />
      )}
    </div>
  );
}

// ─── Add Integration Dialog ───────────────────────────────────────────────────

function AddIntegrationDialog({
  onSubmit, onCancel, isLoading, result,
}: {
  onSubmit: (details: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any;
}) {
  const [details, setDetails] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Add Integration</h3>
          <p className="text-xs text-slate-500 mt-0.5">Describe the integration you want to add</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!result && (
            <input
              type="text"
              value={details}
              onChange={e => setDetails(e.target.value)}
              placeholder="e.g., Add Stripe for payment processing with checkout sessions and webhook handling"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && details.trim()) onSubmit(details); }}
            />
          )}

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating plan...
            </div>
          )}

          {result && !isLoading && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">{result.summary}</p>
              <div className="space-y-1">
                {result.changes?.map((ch: { file: string; action: string; description: string }, i: number) => (
                  <div key={i} className="text-[10px] border border-slate-100 rounded-lg px-3 py-2">
                    <span className={`font-bold mr-1.5 ${
                      ch.action === 'create' ? 'text-green-600' : ch.action === 'delete' ? 'text-red-600' : 'text-blue-600'
                    }`}>{ch.action.toUpperCase()}</span>
                    <span className="font-mono text-slate-700">{ch.file}</span>
                    <p className="text-slate-500 mt-0.5">{ch.description}</p>
                  </div>
                ))}
              </div>
              {result.envVars?.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-slate-500">Required env vars:</p>
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
          <Button size="sm" variant="outline" onClick={onCancel} disabled={isLoading}>Cancel</Button>
          {!result ? (
            <Button size="sm" onClick={() => onSubmit(details)} disabled={isLoading || !details.trim()}>
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
              Generate Plan
            </Button>
          ) : (
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onSubmit('__apply__')} disabled={isLoading}>
              Apply Changes
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_integrations_v1_';
function getCached(dirPath: string): IntegrationsGraph | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}
function setCached(dirPath: string, graph: IntegrationsGraph) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(graph)); } catch { /* quota */ }
}
export function clearIntegrationsCache(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function IntegrationsView() {
  const { directoryPath } = useGraphStore();
  const [graph, setGraph] = useState<IntegrationsGraph | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const loadedForPath = useRef<string | null>(null);

  // Add dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [addResult, setAddResult] = useState<any>(null);

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

    const res = await fetch(`/api/integrations?path=${encodeURIComponent(dirPath)}`);
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
            const g = ev.graph as IntegrationsGraph;
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

  const selectedIntegration = graph?.integrations.find(i => i.id === selectedId) ?? null;

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    if (node.type === 'integration') setSelectedId(node.id);
    else setSelectedId(null);
  }, []);

  const handleAddNew = useCallback(() => {
    setAddOpen(true);
    setAddResult(null);
    setSelectedId(null);
  }, []);

  const handleAddSubmit = useCallback(async (details: string) => {
    if (!directoryPath) return;

    if (details === '__apply__' && addResult?.changes) {
      setAddLoading(true);
      try {
        const res = await fetch('/api/integrations/modify', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: directoryPath, changes: addResult.changes }),
        });
        if (res.ok) {
          setAddOpen(false);
          setAddResult(null);
          clearIntegrationsCache(directoryPath);
          loadedForPath.current = null;
          load(directoryPath, true);
        }
      } finally {
        setAddLoading(false);
      }
      return;
    }

    setAddLoading(true);
    try {
      const res = await fetch('/api/integrations/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirPath: directoryPath, action: 'add', integrationName: details, details }),
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
            if (ev.phase === 'plan') setAddResult(ev.plan);
          } catch { /* skip */ }
        }
      }
    } finally {
      setAddLoading(false);
    }
  }, [directoryPath, addResult, load]);

  const handleRemove = useCallback(async () => {
    if (!directoryPath || !selectedIntegration) return;
    const res = await fetch('/api/integrations/modify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath: directoryPath, action: 'remove', integrationName: selectedIntegration.name, details: '' }),
    });
    if (!res.ok || !res.body) return;
    // stream the plan, then auto-surface it — for now just trigger a re-analysis
    clearIntegrationsCache(directoryPath);
    loadedForPath.current = null;
    setSelectedId(null);
    load(directoryPath, true);
  }, [directoryPath, selectedIntegration, load]);

  const handleApplied = useCallback(() => {
    if (!directoryPath) return;
    clearIntegrationsCache(directoryPath);
    loadedForPath.current = null;
    load(directoryPath, true);
  }, [directoryPath, load]);

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
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm text-slate-600 font-medium">Detecting integrations...</p>
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

  const totalEndpoints = graph.integrations.reduce((n, i) => n + i.endpoints.length, 0);
  const categories = new Set(graph.integrations.map(i => i.category)).size;

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 relative">
        {/* Stats bar */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-500 shadow-sm flex items-center gap-3">
            <span><span className="font-semibold text-blue-600">{graph.integrations.length}</span> integrations</span>
            <span className="text-slate-300">·</span>
            <span><span className="font-semibold text-green-600">{totalEndpoints}</span> endpoints</span>
            <span className="text-slate-300">·</span>
            <span><span className="font-semibold text-purple-500">{categories}</span> categories</span>
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => directoryPath && load(directoryPath, true)}
            className="h-7 px-2 text-xs bg-white/90 backdrop-blur"
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={handleAddNew} className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-3 w-3 mr-1" /> Add Integration
          </Button>
        </div>

        {/* Missing env warning */}
        {graph.summary.missingEnvVars.length > 0 && (
          <div className="absolute top-14 left-3 z-10 bg-amber-50/95 backdrop-blur border border-amber-200 rounded-lg px-3 py-2 shadow-sm max-w-xs">
            <p className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Missing Environment Variables
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

        {/* Legend */}
        <div className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="block w-3 h-3 rounded border-2 border-slate-300 bg-slate-50" />
              Category
            </span>
            <span className="flex items-center gap-1">
              <span className="block w-3 h-3 rounded border-2 border-blue-300 bg-blue-50" />
              Integration
            </span>
          </div>
          <p className="text-[9px] text-slate-400 mt-1">Click a node to inspect and modify</p>
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

        {graph.integrations.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-slate-400 space-y-2">
              <Plug className="h-8 w-8 mx-auto text-slate-300" />
              <p className="text-sm">No integrations detected</p>
              <p className="text-xs">This project may not use third-party services, or they couldn&apos;t be detected</p>
            </div>
          </div>
        )}
      </div>

      {/* Detail / edit panel */}
      {selectedIntegration && directoryPath && (
        <DetailPanel
          integration={selectedIntegration}
          onClose={() => setSelectedId(null)}
          onRemove={handleRemove}
          directoryPath={directoryPath}
          onApplied={handleApplied}
        />
      )}

      {/* Add integration dialog */}
      {addOpen && (
        <AddIntegrationDialog
          onSubmit={handleAddSubmit}
          onCancel={() => { setAddOpen(false); setAddResult(null); }}
          isLoading={addLoading}
          result={addResult}
        />
      )}
    </div>
  );
}
