'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Cloud, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphNodeData } from '@/lib/types';

export function ExternalServiceNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white px-4 py-2.5 shadow-sm min-w-[160px] max-w-[220px]',
        selected ? 'border-red-500 shadow-red-100 shadow-md' : 'border-red-200',
        nodeData.isModified ? 'border-amber-400' : ''
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-red-400" />
      <div className="flex items-center gap-2">
        <div className="shrink-0 h-6 w-6 rounded bg-red-100 flex items-center justify-center">
          <Cloud className="h-3.5 w-3.5 text-red-600" />
        </div>
        <span className="text-sm font-medium text-slate-800 truncate">{nodeData.label}</span>
        {nodeData.isModified && <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
      </div>
      {nodeData.description && (
        <p className="mt-1 text-xs text-slate-500 truncate">{nodeData.description}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-red-400" />
    </div>
  );
}
