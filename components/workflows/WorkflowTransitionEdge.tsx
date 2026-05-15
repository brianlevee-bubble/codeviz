'use client';

import { memo } from 'react';
import { getSmoothStepPath, getBezierPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { Lock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTOR_STYLES: Record<string, { bg: string; text: string }> = {
  ADMIN:  { bg: 'bg-purple-100', text: 'text-purple-700' },
  OWNER:  { bg: 'bg-green-100',  text: 'text-green-700'  },
  EDIT:   { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  MEMBER: { bg: 'bg-slate-100',  text: 'text-slate-600'  },
  USER:   { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  VIEWER: { bg: 'bg-gray-100',   text: 'text-gray-600'   },
};

function actorStyle(actor: string) {
  const upper = actor.toUpperCase();
  for (const [key, style] of Object.entries(ACTOR_STYLES)) {
    if (upper.includes(key)) return style;
  }
  return { bg: 'bg-slate-100', text: 'text-slate-600' };
}

export const WorkflowTransitionEdge = memo(function WorkflowTransitionEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected,
}: EdgeProps) {
  const d = data as {
    action?: string;
    actors?: string[];
    guards?: string[];
    sideEffects?: string[];
    isRegression?: boolean;
    onSelect?: () => void;
  } | undefined;
  const isRegression = d?.isRegression ?? false;
  const action = d?.action ?? '';
  const actors = d?.actors ?? [];
  const guards = d?.guards ?? [];
  const sideEffects = d?.sideEffects ?? [];
  const onSelect = d?.onSelect;

  const [edgePath, midX, midY] = isRegression
    ? getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
    : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 16 });

  const strokeColor = selected
    ? '#3b82f6'
    : isRegression ? '#f59e0b' : '#94a3b8';

  return (
    <>
      {/* Wide transparent click target */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
      />

      {/* Visible path */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={isRegression ? 1.5 : 2}
        strokeDasharray={isRegression ? '6 3' : undefined}
        markerEnd={`url(#${isRegression ? 'workflow-regression-arrow' : 'workflow-forward-arrow'})`}
        className="react-flow__edge-path"
      />

      {/* Label */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${midX}px, ${midY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
          onClick={onSelect}
        >
          <div className={cn(
            'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border shadow-sm bg-white text-center min-w-[60px] cursor-pointer transition-colors',
            selected
              ? 'border-blue-400 ring-1 ring-blue-200'
              : isRegression ? 'border-amber-200 hover:border-amber-300' : 'border-slate-200 hover:border-slate-300'
          )}>
            <span className={cn(
              'text-[10px] font-semibold whitespace-nowrap',
              isRegression ? 'text-amber-700' : 'text-slate-700'
            )}>
              {action}
            </span>

            {actors.length > 0 && (
              <div className="flex flex-wrap gap-0.5 justify-center">
                {actors.map((actor: string) => {
                  const s = actorStyle(actor);
                  return (
                    <span key={actor} className={cn(
                      'text-[8px] font-semibold px-1 py-0.5 rounded-full uppercase tracking-wider',
                      s.bg, s.text
                    )}>
                      {actor}
                    </span>
                  );
                })}
              </div>
            )}

            {guards.length > 0 && (
              <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                {guards.map((guard: string) => (
                  <span key={guard} className="text-[8px] flex items-center gap-0.5 bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.5 rounded-full">
                    <Lock className="h-2 w-2 shrink-0" />
                    {guard}
                  </span>
                ))}
              </div>
            )}

            {sideEffects.length > 0 && (
              <div className="flex flex-wrap gap-0.5 justify-center mt-0.5">
                {sideEffects.map((effect: string) => (
                  <span key={effect} className="text-[8px] flex items-center gap-0.5 bg-blue-50 text-blue-600 border border-blue-200 px-1 py-0.5 rounded-full">
                    <Zap className="h-2 w-2 shrink-0" />
                    {effect}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});
