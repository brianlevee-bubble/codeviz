'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Wrench, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphNodeData } from '@/lib/types';

export function UtilityNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white px-4 py-2 shadow-sm min-w-[140px] max-w-[200px]',
        selected ? 'border-slate-500 shadow-slate-100 shadow-md' : 'border-slate-200',
        nodeData.isModified ? 'border-amber-400' : ''
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-400" />
      <div className="flex items-center gap-2">
        <div className="shrink-0 h-6 w-6 rounded bg-slate-100 flex items-center justify-center">
          <Wrench className="h-3.5 w-3.5 text-slate-600" />
        </div>
        <span className="text-sm font-medium text-slate-700 truncate">{nodeData.label}</span>
        {nodeData.isModified && <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-slate-400" />
    </div>
  );
}
