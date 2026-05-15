'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGraphStore } from '@/lib/store/graph-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GitBranch, ArrowLeft, RefreshCw, CheckCircle, Loader2, CircleCheck, CircleX, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CanvasTab } from '@/lib/types';
import { getCachedAnalysis, timeAgo } from '@/lib/analysis-cache';
import { ANALYSIS_LABELS, type AnalysisId, type AnalysisProgressMap } from '@/lib/analyze-all';

const TABS: { value: CanvasTab; label: string; icon: string; group: 'design' | 'db' | 'code' | 'capabilities' | 'quality' | 'automate' | 'advanced' }[] = [
  { value: 'visual-editor',    label: 'Visual Editor',    icon: '🎨',  group: 'design' },
  { value: 'state-inspector',  label: 'State Inspector',  icon: '🔬',  group: 'advanced' },
  { value: 'ui',               label: 'UI Flow',          icon: '🖼️', group: 'design' },
  { value: 'preview',          label: 'Pages',            icon: '🌐',  group: 'advanced' },
  { value: 'pages-gallery',    label: 'All Pages',        icon: '⊞',   group: 'design' },
  { value: 'workflows',        label: 'Workflows',        icon: '⚡',  group: 'code' },
  { value: 'backend-workflows', label: 'Backend Workflows', icon: '🖥️', group: 'code' },
  { value: 'data-flow-primer', label: 'Data Flow',        icon: '🔄',  group: 'code' },
  { value: 'api-contracts',    label: 'API Contracts',    icon: '📡',  group: 'capabilities' },
  { value: 'schema',           label: 'DB Schema',        icon: '📋',  group: 'db' },
  { value: 'data',             label: 'Data',             icon: '🗄️', group: 'db' },
  { value: 'features',         label: 'Features',         icon: '📦',  group: 'capabilities' },
  { value: 'roles',            label: 'Roles',            icon: '👤',  group: 'capabilities' },
  { value: 'tests',            label: 'Tests',            icon: '🧪',  group: 'quality' },
  { value: 'security',         label: 'Security',         icon: '🔒',  group: 'quality' },
  { value: 'improvements',     label: 'Improvements',     icon: '✨',  group: 'quality' },
  { value: 'integrations',     label: 'Integrations',     icon: '🔌',  group: 'capabilities' },
  { value: 'payments',          label: 'Payments',          icon: '💳',  group: 'capabilities' },
  { value: 'agents',           label: 'Agents',           icon: '🤖',  group: 'automate' },
  { value: 'timeline',         label: 'Timeline',         icon: '⏱️', group: 'advanced' },
  { value: 'dead-code',        label: 'Dead Code',        icon: '🗑️', group: 'advanced' },
  { value: 'queries',          label: 'List Queries',     icon: '🔍',  group: 'advanced' },
  { value: 'architecture',     label: 'Architecture',     icon: '🏗️', group: 'advanced' },
  { value: 'dataFlow',         label: 'Data Flow',        icon: '🔄',  group: 'advanced' },
  { value: 'stateMachine',     label: 'State Machine',    icon: '⚙️',  group: 'advanced' },
  { value: 'permissions',      label: 'Permissions',      icon: '🔐',  group: 'advanced' },
];

const TAB_GROUPS: Array<{ label: string; groups: string[]; collapsible?: boolean }> = [
  { label: 'Design',       groups: ['design'] },
  { label: 'Flows',        groups: ['code'] },
  { label: 'Capabilities', groups: ['capabilities'] },
  { label: 'Database',     groups: ['db'] },
  { label: 'Quality',      groups: ['quality'] },
  { label: 'Automate',     groups: ['automate'] },
  { label: 'Advanced',     groups: ['advanced'], collapsible: true },
];

interface FlowToolbarProps {
  onApplyChanges: () => void;
  onReanalyze: () => void;
  directoryPath: string;
  applyStatus?: import('@/lib/hooks/use-apply-changes').ApplyStatus;
  applyError?: string | null;
  tabProgress?: Partial<AnalysisProgressMap>;
}

export function FlowToolbar({ onApplyChanges, onReanalyze, directoryPath, applyStatus = 'idle', applyError, tabProgress = {} }: FlowToolbarProps) {
  const router = useRouter();
  const {
    graphData,
    activeTab,
    setActiveTab,
    pendingChanges,
  } = useGraphStore();

  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set(['Advanced']));
  const [analysisCollapsed, setAnalysisCollapsed] = useState(false);

  useEffect(() => {
    const cached = getCachedAnalysis(directoryPath);
    setCachedAt(cached?.cachedAt ?? null);
    const interval = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(interval);
  }, [directoryPath]);

  useEffect(() => {
    if (!graphData) return;
    const cached = getCachedAnalysis(directoryPath);
    setCachedAt(cached?.cachedAt ?? null);
  }, [graphData, directoryPath]);

  const hasPending = pendingChanges.length > 0;
  const isWorking = applyStatus === 'generating' || applyStatus === 'applying';
  const isDiagramTab = ['architecture', 'dataFlow', 'stateMachine', 'permissions'].includes(activeTab);
  const showApply = isDiagramTab || activeTab === 'visual-editor';

  return (
    <div className="w-56 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden h-full">

      {/* ── Logo / project header ─────────────────────────────────────── */}
      <div className="px-4 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => router.push('/')}
            className="text-slate-400 hover:text-slate-700 transition-colors shrink-0"
            title="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-7 w-7 rounded bg-blue-600 flex items-center justify-center shrink-0">
            <GitBranch className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-slate-900 text-base truncate">
            {graphData?.projectName ?? 'CodeViz'}
          </span>
        </div>
        {directoryPath && (
          <p className="text-xs text-slate-400 font-mono mt-2 truncate pl-0.5" title={directoryPath}>
            {directoryPath.replace(/^\/Users\/[^/]+\//, '~/')}
          </p>
        )}
      </div>

      {/* ── Tab groups ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-2">
        {TAB_GROUPS.map((group, gi) => {
          const groupTabs = TABS.filter(t => group.groups.includes(t.group));
          const isCollapsed = group.collapsible && collapsedGroups.has(group.label);
          return (
            <div key={gi} className={cn(gi > 0 && 'mt-1')}>
              {/* Group label */}
              {group.collapsible ? (
                <button
                  onClick={() => setCollapsedGroups(prev => {
                    const next = new Set(prev);
                    next.has(group.label) ? next.delete(group.label) : next.add(group.label);
                    return next;
                  })}
                  className="w-full flex items-center gap-1.5 px-4 py-1 hover:text-slate-600 transition-colors"
                >
                  <ChevronRight className={cn('h-3 w-3 text-slate-400 transition-transform shrink-0', !isCollapsed && 'rotate-90')} />
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                    {group.label}
                  </p>
                </button>
              ) : (
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-4 py-1">
                  {group.label}
                </p>
              )}
              {/* Tab buttons */}
              {!isCollapsed && groupTabs.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors',
                    activeTab === tab.value
                      ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-500'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <span className="truncate">{tab.label}</span>
                  {/* Pending badge on diagram tabs */}
                  {hasPending && showApply && tab.value === activeTab && (
                    <span className="ml-auto shrink-0 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded-full">
                      {pendingChanges.length}
                    </span>
                  )}
                </button>
              ))}
              {/* Divider between groups */}
              {gi < TAB_GROUPS.length - 1 && (
                <div className="mx-3 mt-2 mb-1 h-px bg-slate-100" />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Bottom actions ────────────────────────────────────────────── */}
      {graphData && (
        <div className="px-3 py-3 border-t border-slate-100 space-y-1.5">

          {/* Pending changes badge */}
          {hasPending && showApply && (
            <Badge variant="outline" className="w-full justify-center text-amber-600 border-amber-300 bg-amber-50 text-xs py-1">
              {pendingChanges.length} pending change{pendingChanges.length !== 1 ? 's' : ''}
            </Badge>
          )}

          {/* Apply changes */}
          {showApply && (
            <Button
              size="sm"
              onClick={onApplyChanges}
              disabled={!hasPending || isWorking}
              className={cn(
                'w-full h-8 gap-1.5 text-xs',
                hasPending ? 'bg-amber-500 hover:bg-amber-600 text-white' : ''
              )}
            >
              {isWorking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              {applyStatus === 'generating' ? 'Generating…' : applyStatus === 'applying' ? 'Applying…' : applyStatus === 'success' ? '✓ Applied' : 'Apply Changes'}
            </Button>
          )}

          {/* Inline error (replaces alert()) */}
          {applyError && (
            <p className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 leading-snug">
              {applyError}
            </p>
          )}

          {/* Per-tab analysis progress */}
          {(() => {
            const ids = Object.keys(tabProgress) as AnalysisId[];
            if (ids.length === 0) return null;
            const anyRunning = ids.some(id => tabProgress[id] === 'running');
            // Auto-expand while running
            const collapsed = anyRunning ? false : analysisCollapsed;
            return (
              <div className="border border-slate-100 rounded-lg overflow-hidden">
                <button
                  onClick={() => !anyRunning && setAnalysisCollapsed(c => !c)}
                  className="w-full px-2 py-1 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 text-left"
                >
                  {anyRunning
                    ? <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400 shrink-0" />
                    : <CircleCheck className="h-2.5 w-2.5 text-green-500 shrink-0" />}
                  <span className="flex-1 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                    {anyRunning ? 'Analyzing…' : 'Analysis complete'}
                  </span>
                  {!anyRunning && (
                    <ChevronRight className={cn('h-3 w-3 text-slate-400 transition-transform', !collapsed && 'rotate-90')} />
                  )}
                </button>
                {!collapsed && (
                  <div className="divide-y divide-slate-50">
                    {(Object.keys(ANALYSIS_LABELS) as AnalysisId[]).map(id => {
                      const status = tabProgress[id] ?? 'idle';
                      return (
                        <div key={id} className="flex items-center gap-2 px-2 py-1">
                          <span className="flex-1 text-[10px] text-slate-600 truncate">{ANALYSIS_LABELS[id]}</span>
                          {status === 'running' && <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400 shrink-0" />}
                          {status === 'done'    && <CircleCheck className="h-2.5 w-2.5 text-green-500 shrink-0" />}
                          {status === 'error'   && <CircleX className="h-2.5 w-2.5 text-red-400 shrink-0" />}
                          {status === 'idle'    && <span className="h-2.5 w-2.5 shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Re-analyze */}
          <button
            onClick={onReanalyze}
            disabled={isWorking}
            className={cn(
              'w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-all',
              'text-slate-500 hover:text-slate-700 hover:bg-slate-100',
              isWorking && 'opacity-50 cursor-not-allowed'
            )}
            title="Re-analyze project"
          >
            <RefreshCw className="h-3 w-3" />
            <span>{cachedAt ? `Analyzed ${timeAgo(cachedAt)}` : 'Re-analyze'}</span>
          </button>
        </div>
      )}
    </div>
  );
}
