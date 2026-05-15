'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Globe, Key, FileCode } from 'lucide-react';

export const IntegrationNode = memo(function IntegrationNode({ data }: { data: unknown; selected?: boolean }) {
  const d = data as {
    name: string;
    category: string;
    description: string;
    endpointCount: number;
    configCount: number;
    fileCount: number;
    status: 'active' | 'unused' | 'misconfigured';
    package?: string;
    color: string;
  };

  const statusColors = {
    active: 'bg-green-400',
    unused: 'bg-slate-300',
    misconfigured: 'bg-red-400',
  };

  return (
    <div
      className="rounded-xl border-2 bg-white shadow-sm px-4 py-3 min-w-[220px] cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderColor: d.color }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-300 !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-2 h-2 rounded-full ${statusColors[d.status]}`} />
        <span className="text-sm font-semibold text-slate-900 truncate">{d.name}</span>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 mb-2">{d.description}</p>

      {d.package && (
        <p className="text-[9px] font-mono text-slate-400 mb-1.5 truncate">{d.package}</p>
      )}

      <div className="flex items-center gap-3 text-[9px] text-slate-400">
        <span className="flex items-center gap-0.5">
          <Globe className="h-2.5 w-2.5" /> {d.endpointCount}
        </span>
        <span className="flex items-center gap-0.5">
          <Key className="h-2.5 w-2.5" /> {d.configCount}
        </span>
        <span className="flex items-center gap-0.5">
          <FileCode className="h-2.5 w-2.5" /> {d.fileCount}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2" />
    </div>
  );
});
