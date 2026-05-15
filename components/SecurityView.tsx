'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import type { SecurityGraph, SecuredResource, SecurityRule, RuleType, GlobalPolicy } from '@/lib/security/types';
import {
  Loader2, AlertCircle, RefreshCw, Shield, ShieldCheck, ShieldAlert,
  Lock, User, Users, Filter, Zap, ClipboardCheck, Eye, KeyRound,
  FileCode, ChevronDown, ChevronRight, Globe, CheckCircle2, XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Rule type display config ─────────────────────────────────────────────────

const RULE_CONFIG: Record<RuleType, { icon: React.ElementType; color: string; bg: string }> = {
  requires_auth:    { icon: Lock,          color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
  requires_role:    { icon: Users,         color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  ownership:        { icon: User,          color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  field_filter:     { icon: Filter,        color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  rate_limit:       { icon: Zap,           color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  input_validation: { icon: ClipboardCheck, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  middleware:       { icon: Globe,         color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200' },
  audit_log:        { icon: Eye,           color: 'text-teal-600',   bg: 'bg-teal-50 border-teal-200' },
  encryption:       { icon: KeyRound,      color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' },
  pii:              { icon: ShieldAlert,   color: 'text-rose-600',   bg: 'bg-rose-50 border-rose-200' },
};

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  page: 'Page', api: 'API Route', server_action: 'Server Action', middleware: 'Middleware',
};

// ─── Rule chip ────────────────────────────────────────────────────────────────

function RuleChip({ rule }: { rule: SecurityRule }) {
  const cfg = RULE_CONFIG[rule.type] ?? RULE_CONFIG.middleware;
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border', cfg.bg, cfg.color)}>
      <Icon className="h-2.5 w-2.5" />
      {rule.label}
    </span>
  );
}

// ─── Rule detail row ──────────────────────────────────────────────────────────

function RuleRow({ rule }: { rule: SecurityRule }) {
  const [open, setOpen] = useState(false);
  const cfg = RULE_CONFIG[rule.type] ?? RULE_CONFIG.middleware;
  const Icon = cfg.icon;

  return (
    <div className={cn('rounded-lg border overflow-hidden', cfg.bg)}>
      <button
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', cfg.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs font-semibold', cfg.color)}>{rule.label}</span>
            <span className="text-[9px] text-slate-400 uppercase tracking-wide">{rule.type.replace(/_/g, ' ')}</span>
          </div>
          <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">{rule.description}</p>
          {rule.roles && rule.roles.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {rule.roles.map(r => (
                <span key={r} className="text-[9px] bg-white/70 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium">{r}</span>
              ))}
            </div>
          )}
          {rule.hiddenFields && rule.hiddenFields.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {rule.hiddenFields.map(f => (
                <span key={f} className="text-[9px] bg-white/70 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-mono">{f}</span>
              ))}
            </div>
          )}
        </div>
        {rule.code && (
          <span className="shrink-0 mt-0.5">
            {open ? <ChevronDown className="h-3 w-3 text-slate-400" /> : <ChevronRight className="h-3 w-3 text-slate-400" />}
          </span>
        )}
      </button>
      {open && rule.code && (
        <div className="px-3 pb-3">
          <pre className="text-[9px] font-mono text-slate-700 bg-white/60 rounded-lg p-2.5 overflow-x-auto leading-relaxed whitespace-pre-wrap border border-white/50">
            <code>{rule.code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Resource card ────────────────────────────────────────────────────────────

function ResourceCard({ resource, isSelected, onClick }: {
  resource: SecuredResource;
  isSelected: boolean;
  onClick: () => void;
}) {
  const authIcon = resource.requiresAuth
    ? <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
    : <Shield className="h-3.5 w-3.5 text-slate-300" />;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-colors border',
        isSelected
          ? 'bg-blue-50 border-blue-200 text-blue-900'
          : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
      )}
    >
      <div className="flex items-start gap-2">
        {authIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold truncate">{resource.label}</span>
            <span className="text-[9px] text-slate-400 shrink-0 bg-slate-100 px-1.5 py-0.5 rounded-full">
              {RESOURCE_TYPE_LABEL[resource.resourceType] ?? resource.resourceType}
            </span>
          </div>
          {resource.route && (
            <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{resource.route}</p>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {resource.rules.slice(0, 3).map(r => <RuleChip key={r.id} rule={r} />)}
            {resource.rules.length > 3 && (
              <span className="text-[9px] text-slate-400">+{resource.rules.length - 3}</span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Access matrix ────────────────────────────────────────────────────────────

function AccessMatrix({ resources, roles }: { resources: SecuredResource[]; roles: string[] }) {
  if (roles.length === 0) return null;
  // Limit to pages + APIs for readability
  const filtered = resources.filter(r => r.resourceType === 'page' || r.resourceType === 'api');

  return (
    <div className="overflow-auto">
      <table className="text-[10px] border-collapse w-full min-w-max">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200 min-w-[160px]">
              Resource
            </th>
            <th className="px-3 py-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200">
              Auth
            </th>
            {roles.map(role => (
              <th key={role} className="px-3 py-2 font-semibold text-slate-600 bg-slate-50 border border-slate-200 whitespace-nowrap">
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(resource => {
            const isPublic = !resource.requiresAuth;
            return (
              <tr key={resource.id} className="hover:bg-slate-50">
                <td className="px-3 py-2 border border-slate-100">
                  <p className="font-medium text-slate-700">{resource.label}</p>
                  {resource.route && <p className="font-mono text-slate-400 mt-0.5">{resource.route}</p>}
                </td>
                <td className="px-3 py-2 border border-slate-100 text-center">
                  {resource.requiresAuth
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                    : <XCircle className="h-3.5 w-3.5 text-slate-300 mx-auto" />
                  }
                </td>
                {roles.map(role => {
                  const hasAccess = isPublic || resource.allowedRoles.length === 0 ||
                    resource.allowedRoles.some(r => r.toLowerCase() === role.toLowerCase());
                  const isOwnerOnly = resource.rules.some(r => r.type === 'ownership');
                  return (
                    <td key={role} className="px-3 py-2 border border-slate-100 text-center">
                      {hasAccess
                        ? isOwnerOnly
                          ? <span title="Own data only" className="text-amber-500 text-[10px] font-medium">own</span>
                          : <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                        : <XCircle className="h-3.5 w-3.5 text-red-300 mx-auto" />
                      }
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Role access helper ───────────────────────────────────────────────────────

const PUBLIC_ROLE = 'Public';

function resourcesForRole(role: string, resources: SecuredResource[]): {
  accessible: SecuredResource[];
  blocked: SecuredResource[];
} {
  if (role === PUBLIC_ROLE) {
    return {
      accessible: resources.filter(r => !r.requiresAuth),
      blocked: resources.filter(r => r.requiresAuth),
    };
  }
  return {
    accessible: resources.filter(r =>
      !r.requiresAuth ||
      r.allowedRoles.length === 0 ||
      r.allowedRoles.some(ar => ar.toLowerCase() === role.toLowerCase())
    ),
    blocked: resources.filter(r =>
      r.requiresAuth &&
      r.allowedRoles.length > 0 &&
      !r.allowedRoles.some(ar => ar.toLowerCase() === role.toLowerCase())
    ),
  };
}

// ─── Role sidebar card ────────────────────────────────────────────────────────

function RoleCard({ role, resources, isSelected, onClick }: {
  role: string;
  resources: SecuredResource[];
  isSelected: boolean;
  onClick: () => void;
}) {
  const { accessible } = resourcesForRole(role, resources);
  const pages = accessible.filter(r => r.resourceType === 'page').length;
  const apis = accessible.filter(r => r.resourceType === 'api').length;
  const actions = accessible.filter(r => r.resourceType === 'server_action').length;
  const hasOwnership = accessible.some(r => r.rules.some(ru => ru.type === 'ownership'));
  const isPublic = role === PUBLIC_ROLE;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-colors border',
        isSelected
          ? 'bg-purple-50 border-purple-200'
          : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
      )}
    >
      <div className="flex items-center gap-2">
        {isPublic
          ? <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          : <Users className="h-3.5 w-3.5 text-purple-500 shrink-0" />
        }
        <span className={cn('text-xs font-semibold flex-1 truncate', isSelected ? 'text-purple-900' : 'text-slate-700')}>
          {role}
        </span>
        {hasOwnership && (
          <span className="text-[9px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
            own data
          </span>
        )}
      </div>
      <div className="flex gap-2 mt-1 ml-5 text-[9px] text-slate-400">
        {pages > 0 && <span>{pages} page{pages !== 1 ? 's' : ''}</span>}
        {apis > 0 && <span>{apis} API{apis !== 1 ? 's' : ''}</span>}
        {actions > 0 && <span>{actions} action{actions !== 1 ? 's' : ''}</span>}
        {accessible.length === 0 && <span>no access</span>}
      </div>
    </button>
  );
}

// ─── Role detail panel ────────────────────────────────────────────────────────

function RoleDetailPanel({ role, resources }: { role: string; resources: SecuredResource[] }) {
  const [blockedOpen, setBlockedOpen] = useState(false);
  const { accessible, blocked } = resourcesForRole(role, resources);

  const grouped = {
    page: accessible.filter(r => r.resourceType === 'page'),
    api: accessible.filter(r => r.resourceType === 'api'),
    server_action: accessible.filter(r => r.resourceType === 'server_action'),
  };

  const summaryParts: string[] = [];
  if (grouped.page.length) summaryParts.push(`${grouped.page.length} page${grouped.page.length !== 1 ? 's' : ''}`);
  if (grouped.api.length) summaryParts.push(`${grouped.api.length} API route${grouped.api.length !== 1 ? 's' : ''}`);
  if (grouped.server_action.length) summaryParts.push(`${grouped.server_action.length} server action${grouped.server_action.length !== 1 ? 's' : ''}`);

  const isPublic = role === PUBLIC_ROLE;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Role header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', isPublic ? 'bg-slate-100' : 'bg-purple-100')}>
            {isPublic
              ? <Globe className="h-5 w-5 text-slate-500" />
              : <Users className="h-5 w-5 text-purple-600" />
            }
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">{role}</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {summaryParts.length > 0
                ? `Access to ${summaryParts.join(', ')}`
                : 'No accessible resources'
              }
              {blocked.length > 0 && ` · ${blocked.length} blocked`}
            </p>
          </div>
        </div>
      </div>

      {/* Accessible resources */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {(['page', 'api', 'server_action'] as const).map(type => {
            const items = grouped[type];
            if (items.length === 0) return null;
            return (
              <div key={type}>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {RESOURCE_TYPE_LABEL[type]}s
                </h3>
                <div className="space-y-1.5">
                  {items.map(resource => {
                    const ownershipRule = resource.rules.find(r => r.type === 'ownership');
                    const fieldFilter = resource.rules.find(r => r.type === 'field_filter');
                    const roleRule = resource.rules.find(r =>
                      r.type === 'requires_role' &&
                      r.roles?.some(rr => rr.toLowerCase() === role.toLowerCase())
                    );
                    return (
                      <div key={resource.id} className="bg-white border border-slate-100 rounded-lg px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800">{resource.label}</p>
                            {resource.route && (
                              <p className="text-[10px] font-mono text-slate-400 mt-0.5">{resource.route}</p>
                            )}
                          </div>
                          <div className="flex gap-1 flex-wrap shrink-0">
                            {ownershipRule && (
                              <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                                own data only
                              </span>
                            )}
                            {fieldFilter && fieldFilter.hiddenFields && fieldFilter.hiddenFields.length > 0 && (
                              <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                                fields filtered
                              </span>
                            )}
                            {roleRule && (
                              <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium">
                                {roleRule.label}
                              </span>
                            )}
                            {!resource.requiresAuth && (
                              <span className="text-[9px] bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full font-medium">
                                public
                              </span>
                            )}
                          </div>
                        </div>
                        {fieldFilter && fieldFilter.hiddenFields && fieldFilter.hiddenFields.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap items-center">
                            <span className="text-[9px] text-slate-400">hidden:</span>
                            {fieldFilter.hiddenFields.map(f => (
                              <span key={f} className="text-[9px] bg-amber-50 text-amber-600 border border-amber-100 px-1 py-0.5 rounded font-mono">{f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {accessible.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">
              {isPublic ? 'All resources require authentication.' : 'This role has no accessible resources.'}
            </p>
          )}

          {/* Blocked resources (collapsible) */}
          {blocked.length > 0 && (
            <div>
              <button
                onClick={() => setBlockedOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 hover:text-slate-600 transition-colors"
              >
                {blockedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                No Access ({blocked.length})
              </button>
              {blockedOpen && (
                <div className="space-y-1.5">
                  {blocked.map(resource => (
                    <div key={resource.id} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 opacity-60">
                      <p className="text-xs font-semibold text-slate-500">{resource.label}</p>
                      {resource.route && (
                        <p className="text-[10px] font-mono text-slate-400 mt-0.5">{resource.route}</p>
                      )}
                      {resource.allowedRoles.length > 0 && (
                        <p className="text-[9px] text-slate-400 mt-1">
                          Requires: {resource.allowedRoles.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_security_v1_';
function getCached(dirPath: string): SecurityGraph | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}
function setCached(dirPath: string, graph: SecurityGraph) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(graph)); } catch { /* quota */ }
}
export function clearSecurityCache(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Main view ────────────────────────────────────────────────────────────────

type ViewMode = 'rules' | 'roles' | 'matrix';

export function SecurityView() {
  const { directoryPath } = useGraphStore();
  const [graph, setGraph] = useState<SecurityGraph | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('rules');
  const [filterType, setFilterType] = useState<string>('all');
  const loadedForPath = useRef<string | null>(null);

  const load = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) {
        setGraph(cached);
        if (cached.resources.length > 0) setSelectedId(cached.resources[0].id);
        setSelectedRole(cached.allRoles[0] ?? PUBLIC_ROLE);
        setLoadPhase('done');
        return;
      }
    }
    setLoadPhase('reading');
    setLoadError(null);
    setGraph(null);
    setTokenBuffer('');
    setSelectedId(null);
    setSelectedRole(null);

    const res = await fetch(`/api/security?path=${encodeURIComponent(dirPath)}`);
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
            const g = ev.graph as SecurityGraph;
            setCached(dirPath, g);
            setGraph(g);
            if (g.resources.length > 0) setSelectedId(g.resources[0].id);
            setSelectedRole(g.allRoles[0] ?? PUBLIC_ROLE);
            setLoadPhase('done');
            setTokenBuffer('');
          } else if (ev.phase === 'error') {
            setLoadError(ev.error);
            setLoadPhase('error');
          }
        } catch { /* skip */ }
      }
    }
  }, []);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      load(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  // ── Loading states ─────────────────────────────────────────────────────────

  if (loadPhase === 'idle' || loadPhase === 'reading') {
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
          <Shield className="h-10 w-10 text-blue-400 animate-pulse" />
          <p className="text-sm text-slate-600 font-medium">Analyzing security rules…</p>
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

  const selected = graph.resources.find(r => r.id === selectedId) ?? null;
  const allRolesWithPublic = [PUBLIC_ROLE, ...graph.allRoles];

  // Filter sidebar
  const filteredResources = filterType === 'all'
    ? graph.resources
    : graph.resources.filter(r => r.resourceType === filterType);

  const ruleTypeCounts = graph.resources
    .flatMap(r => r.rules)
    .reduce((acc, rule) => { acc[rule.type] = (acc[rule.type] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  const publicCount = graph.resources.filter(r => !r.requiresAuth).length;
  const protectedCount = graph.resources.filter(r => r.requiresAuth).length;

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">Security & Privacy</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={() => directoryPath && load(directoryPath, true)}
              className="h-6 w-6 p-0 text-slate-400">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Stats row */}
          <div className="flex gap-3 mt-2.5">
            <div className="flex-1 bg-green-50 rounded-lg px-2.5 py-1.5 text-center">
              <p className="text-sm font-bold text-green-700">{protectedCount}</p>
              <p className="text-[9px] text-green-500">protected</p>
            </div>
            <div className="flex-1 bg-slate-50 rounded-lg px-2.5 py-1.5 text-center">
              <p className="text-sm font-bold text-slate-500">{publicCount}</p>
              <p className="text-[9px] text-slate-400">public</p>
            </div>
            <div className="flex-1 bg-purple-50 rounded-lg px-2.5 py-1.5 text-center">
              <p className="text-sm font-bold text-purple-700">{graph.allRoles.length}</p>
              <p className="text-[9px] text-purple-500">roles</p>
            </div>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex border-b border-slate-100">
          {(['rules', 'roles', 'matrix'] as ViewMode[]).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={cn(
                'flex-1 py-2 text-[10px] font-medium transition-colors',
                viewMode === mode
                  ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              )}>
              {mode === 'rules' ? '📋 Rules' : mode === 'roles' ? '👤 Roles' : '📊 Matrix'}
            </button>
          ))}
        </div>

        {viewMode === 'rules' && (
          <>
            {/* Filter chips */}
            <div className="px-3 py-2 border-b border-slate-100 flex gap-1.5 flex-wrap">
              {['all', 'page', 'api', 'server_action'].map(type => (
                <button key={type} onClick={() => setFilterType(type)}
                  className={cn(
                    'text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors',
                    filterType === type
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  )}>
                  {type === 'all' ? 'All' : RESOURCE_TYPE_LABEL[type] ?? type}
                </button>
              ))}
            </div>

            {/* Resource list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* Global policies */}
              {graph.globalPolicies.length > 0 && (
                <div className="mb-2">
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">Global Policies</p>
                  {graph.globalPolicies.map((policy, i) => (
                    <GlobalPolicyCard key={i} policy={policy} />
                  ))}
                </div>
              )}
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">
                Resources ({filteredResources.length})
              </p>
              {filteredResources.map(resource => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  isSelected={selectedId === resource.id}
                  onClick={() => setSelectedId(resource.id)}
                />
              ))}
            </div>
          </>
        )}

        {viewMode === 'roles' && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">
              User Types ({allRolesWithPublic.length})
            </p>
            {allRolesWithPublic.map(role => (
              <RoleCard
                key={role}
                role={role}
                resources={graph.resources}
                isSelected={selectedRole === role}
                onClick={() => setSelectedRole(role)}
              />
            ))}
          </div>
        )}

        {viewMode === 'matrix' && (
          <div className="flex-1 overflow-auto p-3">
            <AccessMatrix resources={graph.resources} roles={graph.allRoles} />
          </div>
        )}
      </div>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Roles view */}
        {viewMode === 'roles' && selectedRole && (
          <RoleDetailPanel role={selectedRole} resources={graph.resources} />
        )}

        {/* Rules view */}
        {viewMode === 'rules' && (selected ? (
          <>
            {/* Resource header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    {selected.requiresAuth
                      ? <ShieldCheck className="h-5 w-5 text-green-500" />
                      : <Shield className="h-5 w-5 text-slate-300" />
                    }
                    <h2 className="text-base font-semibold text-slate-900">{selected.label}</h2>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                      {RESOURCE_TYPE_LABEL[selected.resourceType] ?? selected.resourceType}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{selected.summary}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <FileCode className="h-3 w-3" />{selected.file}
                    </span>
                    {selected.route && (
                      <span className="font-mono text-blue-500">{selected.route}</span>
                    )}
                  </div>
                </div>

                {/* Role badges */}
                {selected.allowedRoles.length > 0 && (
                  <div className="shrink-0">
                    <p className="text-[10px] text-slate-400 mb-1">Allowed roles</p>
                    <div className="flex flex-wrap gap-1">
                      {selected.allowedRoles.map(role => (
                        <span key={role} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Rules */}
            <div className="flex-1 overflow-y-auto p-6">
              {selected.rules.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No specific rules found</p>
              ) : (
                <div className="space-y-2 max-w-2xl">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    {selected.rules.length} Security Rule{selected.rules.length !== 1 ? 's' : ''}
                  </h3>
                  {selected.rules.map(rule => (
                    <RuleRow key={rule.id} rule={rule} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Overview when nothing selected */
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-2xl space-y-6">
              <div>
                <h2 className="text-base font-semibold text-slate-900 mb-1">Security Overview</h2>
                <p className="text-sm text-slate-500">Select a resource on the left to inspect its security rules.</p>
              </div>

              {/* Rule type summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(Object.entries(ruleTypeCounts) as [RuleType, number][]).map(([type, count]) => {
                  const cfg = RULE_CONFIG[type];
                  if (!cfg) return null;
                  const Icon = cfg.icon;
                  return (
                    <div key={type} className={cn('rounded-xl border p-3 flex items-center gap-2.5', cfg.bg)}>
                      <Icon className={cn('h-4 w-4 shrink-0', cfg.color)} />
                      <div>
                        <p className={cn('text-xs font-semibold', cfg.color)}>{count}</p>
                        <p className="text-[9px] text-slate-500 capitalize">{type.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Roles */}
              {graph.allRoles.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Roles in this app</h3>
                  <div className="flex flex-wrap gap-2">
                    {graph.allRoles.map(role => (
                      <button
                        key={role}
                        onClick={() => { setViewMode('roles'); setSelectedRole(role); }}
                        className="text-sm bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 rounded-full font-medium hover:bg-purple-100 transition-colors"
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Matrix view placeholder when matrix selected */}
        {viewMode === 'matrix' && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-slate-400">Select a resource in the matrix on the left.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Global policy card ───────────────────────────────────────────────────────

function GlobalPolicyCard({ policy }: { policy: GlobalPolicy }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 overflow-hidden mb-1">
      <button className="w-full flex items-start gap-2 px-3 py-2 text-left" onClick={() => setOpen(o => !o)}>
        <Globe className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-medium text-blue-800 leading-relaxed">{policy.description}</p>
          <p className="text-[9px] font-mono text-blue-400 mt-0.5 truncate">{policy.file}</p>
        </div>
        {policy.code && (
          open ? <ChevronDown className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
               : <ChevronRight className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
        )}
      </button>
      {open && policy.code && (
        <div className="px-3 pb-3">
          <pre className="text-[9px] font-mono text-blue-900 bg-white/60 rounded-lg p-2 overflow-x-auto border border-blue-100 whitespace-pre-wrap">
            {policy.code}
          </pre>
        </div>
      )}
    </div>
  );
}
