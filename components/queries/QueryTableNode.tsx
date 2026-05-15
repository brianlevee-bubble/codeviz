'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { Table2 } from 'lucide-react';
interface Props {
  data: unknown;
  selected?: boolean;
}

export const QueryTableNode = memo(function QueryTableNode({ data, selected }: Props) {
  const d = data as { label: string; usageCount: number };
  return (
    <div className={cn(
      'bg-white rounded-full border-2 shadow-sm px-4 py-2 flex items-center gap-2 transition-all whitespace-nowrap',
      selected ? 'border-orange-400 shadow-orange-100 shadow-md' : 'border-orange-200 hover:border-orange-300'
    )}>
      <Handle type="target" position={Position.Top} className="!bg-orange-300 !border-white !border-2 !w-3 !h-3" />
      <Table2 className="h-3.5 w-3.5 text-orange-500 shrink-0" />
      <span className="text-xs font-semibold text-slate-700">{d.label}</span>
      {d.usageCount > 1 && (
        <span className="text-[9px] bg-orange-50 text-orange-500 px-1 py-0.5 rounded-full font-medium">
          ×{d.usageCount}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  );
});
