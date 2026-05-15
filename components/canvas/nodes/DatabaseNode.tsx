'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Database, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GraphNodeData } from '@/lib/types';

export function DatabaseNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as GraphNodeData;
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white px-4 py-3 shadow-sm min-w-[150px] max-w-[200px]',
        selected ? 'border-orange-500 shadow-orange-100 shadow-md' : 'border-orange-200',
        nodeData.isModified ? 'border-amber-400' : ''
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-orange-400" />
      <div className="flex items-center gap-2">
        <div className="shrink-0 h-6 w-6 rounded bg-orange-100 flex items-center justify-center">
          <Database className="h-3.5 w-3.5 text-orange-600" />
        </div>
        <span className="text-sm font-medium text-slate-800 truncate">{nodeData.label}</span>
        {nodeData.isModified && <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />}
      </div>
      {nodeData.tags && nodeData.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {nodeData.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-orange-400" />
    </div>
  );
}
