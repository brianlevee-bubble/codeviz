'use client';

import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { GraphEdgeData } from '@/lib/types';

export function ReadWriteEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, markerEnd, data, type,
}: EdgeProps) {
  const edgeData = data as GraphEdgeData | undefined;
  const isWrite = type === 'writes' || edgeData?.edgeType === 'writes';
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: '#f97316', strokeWidth: 1.5 }}
      />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          className="absolute pointer-events-none bg-orange-50 border border-orange-200 text-orange-700 text-[10px] px-1 py-0.5 rounded font-bold"
        >
          {isWrite ? 'W' : 'R'}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
