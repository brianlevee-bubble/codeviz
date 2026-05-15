'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { List, Filter, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueryType } from '@/lib/queries/types';

const QUERY_TYPE_COLORS: Record<QueryType, string> = {
  prisma:   'bg-indigo-50 text-indigo-700 border-indigo-200',
  sql:      'bg-amber-50 text-amber-700 border-amber-200',
  fetch:    'bg-cyan-50 text-cyan-700 border-cyan-200',
  trpc:     'bg-purple-50 text-purple-700 border-purple-200',
  supabase: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  other:    'bg-slate-50 text-slate-600 border-slate-200',
};

interface Props {
  data: unknown;
  selected?: boolean;
}

export const QueryListNode = memo(function QueryListNode({ data, selected }: Props) {
  const d = data as {
    name: string;
    description: string;
    queryType: QueryType;
    filters: string[];
    sort?: string;
    limit?: number;
    isPaginated?: boolean;
    query: string;
  };

  const badgeClass = QUERY_TYPE_COLORS[d.queryType] ?? QUERY_TYPE_COLORS.other;
  // Show first 2 lines of the query
  const queryPreview = d.query.split('\n').slice(0, 3).join('\n');

  return (
    <div className={cn(
      'bg-white rounded-xl border-2 shadow-sm w-56 transition-all overflow-hidden',
      selected ? 'border-green-500 shadow-green-100 shadow-md' : 'border-green-200 hover:border-green-300'
    )}>
      <Handle type="target" position={Position.Top} className="!bg-green-300 !border-white !border-2 !w-3 !h-3" />

      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-start gap-2">
        <div className="p-1 rounded bg-green-50 shrink-0 mt-0.5">
          <List className="h-3.5 w-3.5 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-semibold text-slate-800">{d.name}</p>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-medium', badgeClass)}>
              {d.queryType}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{d.description}</p>
        </div>
      </div>

      {/* Query preview */}
      <div className="mx-3 mb-2 bg-slate-950/[0.04] rounded-lg px-2 py-1.5 overflow-hidden">
        <pre className="text-[9px] font-mono text-slate-600 leading-relaxed whitespace-pre-wrap break-all line-clamp-3">
          {queryPreview}
        </pre>
      </div>

      {/* Meta tags */}
      <div className="px-3 pb-2.5 flex flex-wrap gap-1">
        {d.filters.slice(0, 2).map((f, i) => (
          <span key={i} className="flex items-center gap-0.5 text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
            <Filter className="h-2 w-2" />{f}
          </span>
        ))}
        {d.sort && (
          <span className="flex items-center gap-0.5 text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
            <ArrowUpDown className="h-2 w-2" />{d.sort}
          </span>
        )}
        {d.limit && (
          <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
            limit {d.limit}
          </span>
        )}
        {d.isPaginated && (
          <span className="text-[9px] bg-blue-50 text-blue-500 px-1.5 py-0.5 rounded-full">
            paginated
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-green-300 !border-white !border-2 !w-3 !h-3" />
    </div>
  );
});
