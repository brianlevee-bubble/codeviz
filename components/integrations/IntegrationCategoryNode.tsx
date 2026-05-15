'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

export const IntegrationCategoryNode = memo(function IntegrationCategoryNode({ data }: { data: unknown; selected?: boolean }) {
  const d = data as {
    label: string;
    icon: string;
    count: number;
    color: string;
  };

  return (
    <div
      className="rounded-lg border-2 px-4 py-2.5 min-w-[140px] text-center shadow-sm"
      style={{ borderColor: d.color, backgroundColor: d.color + '33' }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-300 !w-2 !h-2" />

      <div className="flex items-center justify-center gap-2">
        <span className="text-base">{d.icon}</span>
        <span className="text-xs font-semibold text-slate-700">{d.label}</span>
        <span className="text-[9px] font-medium text-slate-500 bg-white/60 px-1.5 py-0.5 rounded-full">
          {d.count}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2" />
    </div>
  );
});
