'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Monitor, FileCode, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UIRoute } from '@/lib/ui-flow/types';
import type { DataList } from '@/lib/queries/types';

const QUERY_TYPE_COLOR: Record<string, string> = {
  prisma:   'bg-indigo-50 text-indigo-600 border-indigo-200',
  sql:      'bg-amber-50 text-amber-600 border-amber-200',
  fetch:    'bg-sky-50 text-sky-600 border-sky-200',
  trpc:     'bg-violet-50 text-violet-600 border-violet-200',
  supabase: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  other:    'bg-slate-50 text-slate-500 border-slate-200',
};

interface PageScreenshotNodeData extends Record<string, unknown> {
  route: UIRoute;
  lists?: DataList[];
  onListClick?: (list: DataList) => void;
  accentColor?: string;
  dimmed?: boolean;
}

interface Props {
  data: unknown;
  selected?: boolean;
}

export const PageScreenshotNode = memo(function PageScreenshotNode({ data, selected }: Props) {
  const nodeData = data as unknown as PageScreenshotNodeData;
  const { route, lists, onListClick, accentColor, dimmed } = nodeData;

  return (
    <div
      className={cn(
        'bg-white rounded-xl border-2 shadow-md transition-all overflow-hidden',
        'w-48',
        selected ? 'shadow-lg' : 'hover:border-slate-300',
        dimmed && 'opacity-25 saturate-0'
      )}
      style={{ borderColor: selected ? '#3b82f6' : (accentColor ?? '#e2e8f0') }}
    >
      {accentColor && (
        <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />
      )}
      <Handle type="target" position={Position.Left} className="!bg-slate-400 !border-white !border-2 !w-3 !h-3" />

      {/* Screenshot area */}
      <div className="w-full h-28 bg-slate-100 overflow-hidden relative">
        {route.screenshotUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={route.screenshotUrl}
            alt={route.label}
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-300">
            <Monitor className="h-8 w-8" />
            <span className="text-xs">No screenshot</span>
          </div>
        )}

        {/* Route path badge */}
        <div className="absolute bottom-1 left-1 right-1">
          <div className="bg-black/60 text-white text-[9px] font-mono px-1.5 py-0.5 rounded truncate">
            {route.path}
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="px-2 py-2 flex items-center gap-1.5">
        <div className="p-1 rounded bg-green-50">
          <FileCode className="h-3 w-3 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-800 truncate">{route.label}</div>
          <div className="text-[10px] text-slate-400 font-mono truncate">{route.file}</div>
        </div>
      </div>

      {/* List queries section */}
      {lists && lists.length > 0 && (
        <div className="border-t border-slate-100 px-2 py-1.5">
          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1 mb-1">
            <Database className="h-2.5 w-2.5" /> Queries
          </p>
          <div className="space-y-1">
            {lists.map(list => (
              <button
                key={list.id}
                className="w-full flex items-center gap-1.5 min-w-0 text-left hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 transition-colors"
                onClick={e => { e.stopPropagation(); onListClick?.(list); }}
              >
                <span
                  className={cn(
                    'shrink-0 text-[8px] font-medium px-1 py-0.5 rounded border uppercase tracking-wide',
                    QUERY_TYPE_COLOR[list.queryType] ?? QUERY_TYPE_COLOR.other
                  )}
                >
                  {list.queryType}
                </span>
                <span className="text-[10px] text-slate-700 truncate">{list.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="!bg-slate-400 !border-white !border-2 !w-3 !h-3" />
    </div>
  );
});
