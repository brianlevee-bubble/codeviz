'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  data: unknown;
  selected?: boolean;
}

export const QueryPageNode = memo(function QueryPageNode({ data, selected }: Props) {
  const d = data as { label: string; route: string; listCount: number };
  return (
    <div className={cn(
      'bg-white rounded-xl border-2 shadow-sm px-4 py-3 min-w-[140px] text-center transition-all',
      selected ? 'border-blue-500 shadow-blue-100 shadow-md' : 'border-blue-200 hover:border-blue-300'
    )}>
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <div className="flex flex-col items-center gap-1.5">
        <div className="p-1.5 rounded-lg bg-blue-50">
          <LayoutDashboard className="h-4 w-4 text-blue-600" />
        </div>
        <p className="text-xs font-semibold text-slate-800">{d.label}</p>
        <p className="text-[10px] font-mono text-slate-400">{d.route}</p>
        {d.listCount > 0 && (
          <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">
            {d.listCount} list{d.listCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-300 !border-white !border-2 !w-3 !h-3" />
    </div>
  );
});
