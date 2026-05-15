'use client';

import { memo } from 'react';
import { getSmoothStepPath, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';

export const BackendConnectionEdge = memo(function BackendConnectionEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, selected,
}: EdgeProps) {
  const d = data as {
    label?: string;
    condition?: string;
    onSelect?: () => void;
  } | undefined;

  const label = d?.label ?? '';
  const condition = d?.condition;
  const onSelect = d?.onSelect;

  const [edgePath, midX, midY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 16,
  });

  const strokeColor = selected ? '#3b82f6' : '#94a3b8';

  return (
    <>
      <path d={edgePath} fill="none" stroke="transparent" strokeWidth={20} style={{ cursor: 'pointer' }} />
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        markerEnd="url(#backend-arrow)"
        className="react-flow__edge-path"
      />

      {(label || condition) && (
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
              'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border shadow-sm bg-white text-center min-w-[40px] cursor-pointer transition-colors',
              selected ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200 hover:border-slate-300'
            )}>
              {label && (
                <span className="text-[10px] font-semibold text-slate-700 whitespace-nowrap">
                  {label}
                </span>
              )}
              {condition && (
                <span className="text-[8px] text-amber-700 bg-amber-50 border border-amber-200 px-1 py-0.5 rounded-full">
                  {condition}
                </span>
              )}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
