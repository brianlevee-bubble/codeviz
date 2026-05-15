'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { StateKind } from '@/lib/workflows/types';
import { cn } from '@/lib/utils';

const KIND_STYLES: Record<Exclude<StateKind, 'gateway'>, { bg: string; border: string; text: string; badge: string; badgeText: string; dot: string }> = {
  initial:  { bg: 'bg-slate-50',  border: 'border-slate-300', text: 'text-slate-700',  badge: 'bg-slate-200',  badgeText: 'text-slate-600',  dot: 'bg-slate-400'  },
  active:   { bg: 'bg-blue-50',   border: 'border-blue-300',  text: 'text-blue-800',   badge: 'bg-blue-100',   badgeText: 'text-blue-600',   dot: 'bg-blue-400'   },
  review:   { bg: 'bg-amber-50',  border: 'border-amber-300', text: 'text-amber-800',  badge: 'bg-amber-100',  badgeText: 'text-amber-700',  dot: 'bg-amber-400'  },
  terminal: { bg: 'bg-green-50',  border: 'border-green-300', text: 'text-green-800',  badge: 'bg-green-100',  badgeText: 'text-green-700',  dot: 'bg-green-500'  },
  error:    { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',    badge: 'bg-red-100',    badgeText: 'text-red-600',    dot: 'bg-red-400'    },
};

const KIND_LABELS: Record<Exclude<StateKind, 'gateway'>, string> = {
  initial:  'start',
  active:   'active',
  review:   'review',
  terminal: 'done',
  error:    'error',
};

interface Props {
  data: unknown;
  selected?: boolean;
}

// ── Gateway (diamond decision node) ───────────────────────────────────────────

function GatewayNode({ label }: { label: string }) {
  const SIZE = 88; // outer bounding box
  const DIAMOND = SIZE - 8;

  return (
    <div style={{ width: SIZE, height: SIZE, position: 'relative' }}>
      {/* Diamond shape */}
      <div style={{
        position: 'absolute',
        top: 4, left: 4,
        width: DIAMOND, height: DIAMOND,
        transform: 'rotate(45deg)',
        background: '#dbeafe',
        border: '2px solid #60a5fa',
        borderRadius: 6,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }} />
      {/* Label — not rotated */}
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
          color: '#1d4ed8',
          textAlign: 'center',
          lineHeight: 1.25,
          wordBreak: 'break-word',
        }}>
          {label}
        </span>
      </div>

      {/* Handles on all four cardinal points of the diamond */}
      <Handle type="target"  position={Position.Left}   style={{ top: '50%', background: '#60a5fa', border: '2px solid #fff', width: 8, height: 8 }} />
      <Handle type="source"  position={Position.Right}  style={{ top: '50%', background: '#60a5fa', border: '2px solid #fff', width: 8, height: 8 }} id="right" />
      <Handle type="source"  position={Position.Bottom} style={{ left: '50%', background: '#60a5fa', border: '2px solid #fff', width: 8, height: 8 }} id="bottom" />
      <Handle type="source"  position={Position.Top}    style={{ left: '50%', background: '#60a5fa', border: '2px solid #fff', width: 8, height: 8 }} id="top" />
    </div>
  );
}

// ── State node ─────────────────────────────────────────────────────────────────

export const WorkflowStateNode = memo(function WorkflowStateNode({ data }: Props) {
  const d = data as { label: string; description?: string; kind: StateKind };

  if (d.kind === 'gateway') {
    return <GatewayNode label={d.label} />;
  }

  const s = KIND_STYLES[d.kind] ?? KIND_STYLES.active;

  return (
    <div className={cn(
      'w-44 rounded-xl border-2 px-3 py-2.5 shadow-sm relative',
      s.bg, s.border
    )}>
      {/* Kind badge */}
      <span className={cn(
        'absolute -top-2 left-2.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full',
        s.badge, s.badgeText
      )}>
        {KIND_LABELS[d.kind]}
      </span>

      {/* State label */}
      <p className={cn('text-[11px] font-bold font-mono leading-tight mt-1', s.text)}>
        {d.label}
      </p>

      {/* Description */}
      {d.description && (
        <p className="text-[9px] text-slate-500 leading-snug mt-1 line-clamp-2">
          {d.description}
        </p>
      )}

      {/* Kind indicator dot */}
      <span className={cn('absolute top-2 right-2 w-2 h-2 rounded-full', s.dot)} />

      <Handle type="target" position={Position.Left}
        className="!w-2 !h-2 !bg-slate-300 !border-white !border-2" />
      <Handle type="source" position={Position.Right}
        className="!w-2 !h-2 !bg-slate-300 !border-white !border-2" />
    </div>
  );
});
