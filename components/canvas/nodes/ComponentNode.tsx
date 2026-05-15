'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphNodeData } from '@/lib/types';

export function ComponentNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white px-4 py-2.5 shadow-sm min-w-[160px] max-w-[220px]',
        'transition-shadow',
        selected ? 'border-blue-500 shadow-blue-100 shadow-md' : 'border-blue-200',
        nodeData.isModified ? 'border-amber-400' : ''
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-blue-400" />
      <div className="flex items-center gap-2">
        <div className="shrink-0 h-6 w-6 rounded bg-blue-100 flex items-center justify-center">
          <Box className="h-3.5 w-3.5 text-blue-600" />
        </div>
        <span className="text-sm font-medium text-slate-800 truncate">{nodeData.label}</span>
        {nodeData.isModified && <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
      </div>
      {nodeData.description && (
        <p className="mt-1 text-xs text-slate-500 truncate">{nodeData.description}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-blue-400" />
    </div>
  );
}
