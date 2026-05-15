'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { StepKind } from '@/lib/backend-workflows/types';

const KIND_STYLES: Record<Exclude<StepKind, 'decision'>, { bg: string; border: string; text: string; badge: string; badgeText: string; icon: string }> = {
  trigger:        { bg: 'bg-emerald-50',  border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-200',  badgeText: 'text-emerald-700', icon: '⚡' },
  process:        { bg: 'bg-blue-50',     border: 'border-blue-300',    text: 'text-blue-800',    badge: 'bg-blue-100',     badgeText: 'text-blue-600',    icon: '⚙️' },
  data:           { bg: 'bg-violet-50',   border: 'border-violet-300',  text: 'text-violet-800',  badge: 'bg-violet-100',   badgeText: 'text-violet-600',  icon: '🗄️' },
  integration:    { bg: 'bg-orange-50',   border: 'border-orange-300',  text: 'text-orange-800',  badge: 'bg-orange-100',   badgeText: 'text-orange-600',  icon: '🔗' },
  output:         { bg: 'bg-cyan-50',     border: 'border-cyan-300',    text: 'text-cyan-800',    badge: 'bg-cyan-100',     badgeText: 'text-cyan-600',    icon: '📤' },
  'error-handler': { bg: 'bg-red-50',    border: 'border-red-200',     text: 'text-red-700',     badge: 'bg-red-100',      badgeText: 'text-red-600',     icon: '🛑' },
};

const KIND_LABELS: Record<Exclude<StepKind, 'decision'>, string> = {
  trigger: 'trigger',
  process: 'process',
  data: 'data',
  integration: 'integration',
  output: 'output',
  'error-handler': 'error',
};

function DecisionNode({ label }: { label: string }) {
  const SIZE = 88;
  const DIAMOND = SIZE - 8;

  return (
    <div style={{ width: SIZE, height: SIZE, position: 'relative' }}>
      <div style={{
        position: 'absolute',
        top: 4, left: 4,
        width: DIAMOND, height: DIAMOND,
        transform: 'rotate(45deg)',
        background: '#fef3c7',
        border: '2px solid #f59e0b',
        borderRadius: 6,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 10px',
      }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: '#92400e',
          textAlign: 'center',
          lineHeight: 1.25,
          wordBreak: 'break-word',
        }}>
          {label}
        </span>
      </div>
      <Handle type="target" position={Position.Left}
        style={{ top: '50%', background: '#f59e0b', border: '2px solid #fff', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right}
        style={{ top: '50%', background: '#f59e0b', border: '2px solid #fff', width: 8, height: 8 }} id="right" />
      <Handle type="source" position={Position.Bottom}
        style={{ left: '50%', background: '#f59e0b', border: '2px solid #fff', width: 8, height: 8 }} id="bottom" />
      <Handle type="source" position={Position.Top}
        style={{ left: '50%', background: '#f59e0b', border: '2px solid #fff', width: 8, height: 8 }} id="top" />
    </div>
  );
}

export const BackendStepNode = memo(function BackendStepNode({ data }: { data: unknown; selected?: boolean }) {
  const d = data as { label: string; description?: string; kind: StepKind; file?: string; method?: string };

  if (d.kind === 'decision') {
    return <DecisionNode label={d.label} />;
  }

  const s = KIND_STYLES[d.kind] ?? KIND_STYLES.process;

  return (
    <div className={cn(
      'w-48 rounded-xl border-2 px-3 py-2.5 shadow-sm relative',
      s.bg, s.border
    )}>
      <span className={cn(
        'absolute -top-2 left-2.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
        s.badge, s.badgeText
      )}>
        {s.icon} {KIND_LABELS[d.kind]}
      </span>

      <p className={cn('text-[11px] font-bold leading-tight mt-1', s.text)}>
        {d.label}
      </p>

      {d.description && (
        <p className="text-[9px] text-slate-500 leading-snug mt-1 line-clamp-2">
          {d.description}
        </p>
      )}

      {d.file && (
        <p className="text-[8px] text-slate-400 font-mono mt-1 truncate">
          {d.file}
        </p>
      )}

      <Handle type="target" position={Position.Left}
        className="!w-2 !h-2 !bg-slate-300 !border-white !border-2" />
      <Handle type="source" position={Position.Right}
        className="!w-2 !h-2 !bg-slate-300 !border-white !border-2" />
    </div>
  );
});
