'use client';

import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import type { SecurityGraph, SecuredResource, RoleGroup } from '@/lib/security/types';
import { Users, Globe, ChevronDown, ChevronRight, RefreshCw, Sparkles, LayoutGrid, Check, Minus, Pencil, Trash2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PUBLIC_ROLE = 'Public';

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  page: 'Page', api: 'API Route', server_action: 'Server Action', middleware: 'Middleware',
};

const CACHE_PREFIX = 'codeviz_security_v2_';
const SUMMARIES_CACHE_PREFIX = 'codeviz_rolessummaries_v1_';

function getCached(dirPath: string): SecurityGraph | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}

function getCachedSummaries(dirPath: string): Record<string, string> | null {
  try { return JSON.parse(localStorage.getItem(SUMMARIES_CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}

function resourcesForRole(role: string, resources: SecuredResource[]) {
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

function RoleCard({ role, resources, isSelected, onClick }: {
  role: string; resources: SecuredResource[]; isSelected: boolean; onClick: () => void;
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

function RoleDetailPanel({ role, resources, aiSummary, aiLoading, scopeLabel: scope }: {
  role: string;
  resources: SecuredResource[];
  aiSummary: string;
  aiLoading: boolean;
  scopeLabel: string | null;
}) {
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
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', isPublic ? 'bg-slate-100' : 'bg-purple-100')}>
            {isPublic
              ? <Globe className="h-5 w-5 text-slate-500" />
              : <Users className="h-5 w-5 text-purple-600" />
            }
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">{role}</h2>
              {scope && (
                <span className="text-[9px] font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                  {scope}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">
              {summaryParts.length > 0
                ? `Access to ${summaryParts.join(', ')}`
                : 'No accessible resources'
              }
              {blocked.length > 0 && ` · ${blocked.length} blocked`}
            </p>
          </div>
        </div>

        {/* AI summary */}
        {(aiLoading || aiSummary) && (
          <div className="mt-3 flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2.5">
            <Sparkles className={cn('h-3.5 w-3.5 text-purple-400 mt-0.5 shrink-0', aiLoading && 'animate-pulse')} />
            <p className="text-xs text-purple-800 leading-relaxed">
              {aiSummary || <span className="text-purple-400">Summarizing…</span>}
            </p>
          </div>
        )}
      </div>

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
                              <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">own data only</span>
                            )}
                            {fieldFilter?.hiddenFields && fieldFilter.hiddenFields.length > 0 && (
                              <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">fields filtered</span>
                            )}
                            {roleRule && (
                              <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium">{roleRule.label}</span>
                            )}
                            {!resource.requiresAuth && (
                              <span className="text-[9px] bg-slate-50 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded-full font-medium">public</span>
                            )}
                          </div>
                        </div>
                        {fieldFilter?.hiddenFields && fieldFilter.hiddenFields.length > 0 && (
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
                        <p className="text-[9px] text-slate-400 mt-1">Requires: {resource.allowedRoles.join(', ')}</p>
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

function scopeLabel(role: string, groups: RoleGroup[]): string | null {
  if (groups.length <= 1) return null;
  return groups.find(g => g.roles.includes(role))?.scopeLabel ?? null;
}

function PermissionMatrix({ graph }: { graph: SecurityGraph }) {
  const { addPermissionChange, pendingChanges } = useGraphStore();
  const groups: RoleGroup[] = graph.roleGroups ?? [];
  const allRoles = [PUBLIC_ROLE, ...graph.allRoles];
  const byType: Record<string, SecuredResource[]> = {
    page: graph.resources.filter(r => r.resourceType === 'page'),
    api: graph.resources.filter(r => r.resourceType === 'api'),
    server_action: graph.resources.filter(r => r.resourceType === 'server_action'),
  };

  // Local overrides: key = `${resourceId}::${role}`, value = override access boolean
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());

  function cellKey(resourceId: string, role: string) {
    return `${resourceId}::${role}`;
  }

  function baseAccess(role: string, resource: SecuredResource): boolean {
    return resourcesForRole(role, [resource]).accessible.length > 0;
  }

  function effectiveAccess(role: string, resource: SecuredResource): boolean {
    const key = cellKey(resource.id, role);
    return overrides.has(key) ? overrides.get(key)! : baseAccess(role, resource);
  }

  function toggleCell(role: string, resource: SecuredResource) {
    if (role === PUBLIC_ROLE) return; // public access requires auth changes, skip for now
    const key = cellKey(resource.id, role);
    const current = effectiveAccess(role, resource);
    const newAccess = !current;
    const base = baseAccess(role, resource);

    setOverrides(prev => {
      const next = new Map(prev);
      if (newAccess === base) {
        next.delete(key); // revert to original
      } else {
        next.set(key, newAccess);
      }
      return next;
    });

    addPermissionChange({
      role,
      resourceId: resource.id,
      resourceLabel: resource.label,
      resourceFile: resource.file,
      resourceRoute: resource.route,
      grant: newAccess,
    });
  }

  const pendingCount = pendingChanges.filter(c => c.changeType === 'permission_change').length;
  const sections = (['page', 'api', 'server_action'] as const).filter(t => byType[t].length > 0);
  const multiScope = groups.length > 1;

  if (graph.resources.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        No secured resources found.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Permission Overview</h2>
            <p className="text-xs text-slate-500 mt-0.5">Click any cell to toggle access · changes queue for code generation</p>
          </div>
          {pendingCount > 0 && (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full">
              {pendingCount} permission change{pendingCount !== 1 ? 's' : ''} queued
            </span>
          )}
        </div>

        {multiScope && (
          <div className="flex flex-wrap gap-2 mb-5">
            {groups.map(g => (
              <div key={g.scope} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px]">
                <span className="font-semibold text-slate-700">{g.scopeLabel}</span>
                {g.description && <span className="text-slate-400">— {g.description}</span>}
              </div>
            ))}
          </div>
        )}

        {sections.map(type => (
          <div key={type} className="mb-8">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              {RESOURCE_TYPE_LABEL[type]}s
            </h3>
            <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-slate-500 font-medium w-1/3">
                      Resource
                    </th>
                    {allRoles.map(role => {
                      const label = scopeLabel(role, groups);
                      return (
                        <th key={role} className="px-3 py-2.5 text-center font-semibold text-slate-700 min-w-[90px]">
                          <div className="flex flex-col items-center gap-0.5">
                            {role === PUBLIC_ROLE
                              ? <Globe className="h-3 w-3 text-slate-400" />
                              : <Users className="h-3 w-3 text-purple-500" />
                            }
                            <span className="text-[10px]">{role}</span>
                            {label && (
                              <span className="text-[8px] font-normal text-slate-400 bg-slate-100 px-1 py-0.5 rounded-full leading-none">
                                {label}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {byType[type].map((resource, i) => (
                    <tr
                      key={resource.id}
                      className={cn(
                        'border-b border-slate-100 last:border-0',
                        i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{resource.label}</p>
                        {resource.route && (
                          <p className="text-[10px] font-mono text-slate-400 mt-0.5">{resource.route}</p>
                        )}
                      </td>
                      {allRoles.map(role => {
                        const ok = effectiveAccess(role, resource);
                        const key = cellKey(resource.id, role);
                        const isPending = overrides.has(key);
                        const ownershipOnly = ok && !isPending && resource.rules.some(r => r.type === 'ownership');
                        const isPublic = role === PUBLIC_ROLE;

                        return (
                          <td key={role} className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => toggleCell(role, resource)}
                              disabled={isPublic}
                              title={isPublic ? 'Public access is controlled by auth middleware' : (ok ? 'Click to revoke access' : 'Click to grant access')}
                              className={cn(
                                'flex flex-col items-center gap-0.5 mx-auto rounded-lg p-1 transition-all',
                                !isPublic && 'hover:bg-slate-100 cursor-pointer',
                                isPublic && 'cursor-default',
                                isPending && 'ring-2 ring-amber-400 ring-offset-1 rounded-lg'
                              )}
                            >
                              {ok ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100">
                                  <Check className="h-3 w-3 text-emerald-600" strokeWidth={2.5} />
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100">
                                  <Minus className="h-3 w-3 text-slate-400" strokeWidth={2} />
                                </span>
                              )}
                              {ownershipOnly && (
                                <span className="text-[8px] text-amber-600 font-medium">own only</span>
                              )}
                              {isPending && (
                                <span className="text-[8px] text-amber-600 font-semibold">pending</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-4 text-[10px] text-slate-500 mt-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100">
              <Check className="h-2.5 w-2.5 text-emerald-600" strokeWidth={2.5} />
            </span>
            Has access
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100">
              <Minus className="h-2.5 w-2.5 text-slate-400" strokeWidth={2} />
            </span>
            No access
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-amber-600 font-medium">own only</span>
            — restricted to own data
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex w-3 h-3 rounded ring-2 ring-amber-400" />
            pending change
          </div>
        </div>
      </div>
    </div>
  );
}

async function generateRoleSummary(role: string, graph: SecurityGraph): Promise<string> {
  const { accessible, blocked } = resourcesForRole(role, graph.resources);
  const isPublic = role === PUBLIC_ROLE;

  const accessLines = accessible.map(r => {
    const ownership = r.rules.some(ru => ru.type === 'ownership') ? ' (own data only)' : '';
    const fieldFilter = r.rules.find(ru => ru.type === 'field_filter');
    const fields = fieldFilter?.hiddenFields?.length ? ` (fields hidden: ${fieldFilter.hiddenFields.join(', ')})` : '';
    return `  - ${r.label}${r.route ? ` (${r.route})` : ''}${ownership}${fields}`;
  }).join('\n');

  const blockedLines = blocked.slice(0, 5).map(r => `  - ${r.label}`).join('\n');

  const prompt = `You are summarizing access permissions for a "${role}" user role in a web app.

${isPublic ? 'This is the public/unauthenticated user.' : `Role: ${role}`}

Accessible resources (${accessible.length}):
${accessLines || '  (none)'}

${blocked.length > 0 ? `Blocked resources (${blocked.length}):\n${blockedLines}${blocked.length > 5 ? `\n  ... and ${blocked.length - 5} more` : ''}` : 'No blocked resources.'}

Write 1-2 sentences describing what this user can do and any notable restrictions. Be specific and practical. No bullet points, no headers.`;

  const res = await fetch('/api/ai-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, maxTokens: 120 }),
  });
  if (!res.ok) return '';
  const data = await res.json();
  return data.text ?? '';
}

export function RolesView() {
  const { directoryPath } = useGraphStore();
  const { addRoleChange } = useGraphStore();
  const [graph, setGraph] = useState<SecurityGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [showOverview, setShowOverview] = useState(false);
  // Local editable roles list
  const [localRoles, setLocalRoles] = useState<string[]>([]);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingRole, setAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState<string | null>(null);
  const summaryCache = useRef<Record<string, string>>({});

  // Try to load pre-computed summaries from cache; poll until available
  useEffect(() => {
    if (!directoryPath) return;
    // Immediately check
    const cached = getCachedSummaries(directoryPath);
    if (cached) {
      summaryCache.current = cached;
      setSummaries(cached);
      return;
    }
    // Poll every 500ms for up to 60s
    const interval = setInterval(() => {
      const c = getCachedSummaries(directoryPath);
      if (c) {
        summaryCache.current = c;
        setSummaries(c);
        clearInterval(interval);
      }
    }, 500);
    const timeout = setTimeout(() => clearInterval(interval), 60_000);
    return () => { clearInterval(interval); clearTimeout(timeout); };
  }, [directoryPath]);

  const loadSummary = async (role: string, g: SecurityGraph) => {
    if (summaryCache.current[role]) {
      setSummaries(prev => ({ ...prev, [role]: summaryCache.current[role] }));
      return;
    }
    setSummaryLoading(role);
    const text = await generateRoleSummary(role, g).catch(() => '');
    summaryCache.current[role] = text;
    setSummaries(prev => ({ ...prev, [role]: text }));
    setSummaryLoading(null);
  };

  // Sync localRoles from graph
  useEffect(() => {
    if (graph) setLocalRoles(graph.allRoles);
  }, [graph]);

  const commitRename = (oldRole: string) => {
    const trimmed = editValue.trim();
    setEditingRole(null);
    if (!trimmed || trimmed === oldRole) return;
    setLocalRoles(prev => prev.map(r => r === oldRole ? trimmed : r));
    if (selectedRole === oldRole) setSelectedRole(trimmed);
    addRoleChange({ type: 'role_renamed', role: oldRole, newName: trimmed });
  };

  const deleteRole = (role: string) => {
    setLocalRoles(prev => prev.filter(r => r !== role));
    if (selectedRole === role) { setSelectedRole(null); setShowOverview(true); }
    addRoleChange({ type: 'role_deleted', role });
  };

  const commitAdd = () => {
    const trimmed = newRoleName.trim();
    setAddingRole(false);
    setNewRoleName('');
    if (!trimmed || localRoles.includes(trimmed)) return;
    setLocalRoles(prev => [...prev, trimmed]);
    addRoleChange({ type: 'role_added', role: trimmed });
  };

  const handleSelectRole = (role: string, g: SecurityGraph) => {
    setShowOverview(false);
    setSelectedRole(role);
    if (!summaryCache.current[role]) {
      loadSummary(role, g);
    }
  };

  useEffect(() => {
    if (!directoryPath) return;
    const cached = getCached(directoryPath);
    if (cached) {
      setGraph(cached);
      setShowOverview(true);
      return;
    }
    setLoading(true);
    fetch(`/api/security?path=${encodeURIComponent(directoryPath)}`)
      .then(res => {
        if (!res.ok || !res.body) throw new Error('Failed');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const pump = async (): Promise<void> => {
          const { done, value } = await reader.read();
          if (done) return;
          for (const line of decoder.decode(value).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.phase === 'complete') {
                const g = ev.graph as SecurityGraph;
                try { localStorage.setItem(CACHE_PREFIX + btoa(directoryPath), JSON.stringify(g)); } catch { /* quota */ }
                setGraph(g);
                setShowOverview(true);
                setLoading(false);
              }
            } catch { /* skip */ }
          }
          return pump();
        };
        return pump();
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span className="text-sm">Analyzing permissions…</span>
        </div>
      </div>
    );
  }

  if (!graph) return null;

  const allRolesWithPublic = [PUBLIC_ROLE, ...graph.allRoles];
  const groups: RoleGroup[] = graph.roleGroups ?? [];
  const multiScope = groups.length > 1;

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-600" />
            <h2 className="text-sm font-semibold text-slate-900">User Roles</h2>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{allRolesWithPublic.length} role{allRolesWithPublic.length !== 1 ? 's' : ''} detected</p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* Overview button */}
          <button
            onClick={() => { setShowOverview(true); setSelectedRole(null); }}
            className={cn(
              'w-full text-left px-3 py-2.5 rounded-lg transition-colors border flex items-center gap-2',
              showOverview
                ? 'bg-indigo-50 border-indigo-200'
                : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
            )}
          >
            <LayoutGrid className={cn('h-3.5 w-3.5 shrink-0', showOverview ? 'text-indigo-500' : 'text-slate-400')} />
            <span className={cn('text-xs font-semibold', showOverview ? 'text-indigo-900' : 'text-slate-700')}>
              Overview
            </span>
          </button>

          <div className="border-t border-slate-100 pt-1 mt-1">
            {/* Public role — read-only */}
            <RoleCard
              role={PUBLIC_ROLE}
              resources={graph.resources}
              isSelected={!showOverview && selectedRole === PUBLIC_ROLE}
              onClick={() => handleSelectRole(PUBLIC_ROLE, graph)}
            />

            {/* Editable roles */}
            {localRoles.map(role => (
              <div key={role} className="group relative">
                {editingRole === role ? (
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(role); if (e.key === 'Escape') setEditingRole(null); }}
                      onBlur={() => commitRename(role)}
                      className="flex-1 text-xs font-semibold border border-purple-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-purple-400"
                    />
                    <button onClick={() => setEditingRole(null)} className="text-slate-400 hover:text-slate-600 p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <RoleCard
                      role={role}
                      resources={graph.resources}
                      isSelected={!showOverview && selectedRole === role}
                      onClick={() => handleSelectRole(role, graph)}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingRole(role); setEditValue(role); }}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        title="Rename role"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteRole(role); }}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="Delete role"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Add new role */}
            {addingRole ? (
              <div className="flex items-center gap-1 px-2 py-1.5 mt-1">
                <input
                  autoFocus
                  placeholder="Role name…"
                  value={newRoleName}
                  onChange={e => setNewRoleName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAddingRole(false); setNewRoleName(''); } }}
                  onBlur={commitAdd}
                  className="flex-1 text-xs border border-purple-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-purple-400"
                />
                <button onClick={() => { setAddingRole(false); setNewRoleName(''); }} className="text-slate-400 hover:text-slate-600 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingRole(true)}
                className="w-full mt-1 flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-dashed border-slate-200 hover:border-purple-300"
              >
                <Plus className="h-3 w-3" />
                Add role
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Detail */}
      {showOverview ? (
        <PermissionMatrix graph={graph} />
      ) : selectedRole ? (
        <RoleDetailPanel
          role={selectedRole}
          resources={graph.resources}
          aiSummary={summaries[selectedRole] ?? ''}
          aiLoading={summaryLoading === selectedRole}
          scopeLabel={multiScope ? (groups.find(g => g.roles.includes(selectedRole))?.scopeLabel ?? null) : null}
        />
      ) : null}
    </div>
  );
}
