'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Server, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphNodeData } from '@/lib/types';

export function APIEndpointNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white px-4 py-2.5 shadow-sm min-w-[180px] max-w-[240px]',
        selected ? 'border-purple-500 shadow-purple-100 shadow-md' : 'border-purple-200',
        nodeData.isModified ? 'border-amber-400' : ''
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-purple-400" />
      <div className="flex items-center gap-2">
        <div className="shrink-0 h-6 w-6 rounded bg-purple-100 flex items-center justify-center">
          <Server className="h-3.5 w-3.5 text-purple-600" />
        </div>
        <span className="text-sm font-medium text-slate-800 truncate">{nodeData.label}</span>
        {nodeData.isModified && <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
      </div>
      {nodeData.description && (
        <p className="mt-1 text-xs text-slate-500 truncate">{nodeData.description}</p>
      )}
      <Handle type="source" position={Position.Right} className="!bg-purple-400" />
    </div>
  );
}
