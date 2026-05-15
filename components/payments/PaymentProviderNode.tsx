'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { CreditCard, Webhook, Package, ArrowRightLeft } from 'lucide-react';

export const PaymentProviderNode = memo(function PaymentProviderNode({ data }: { data: unknown; selected?: boolean }) {
  const d = data as {
    name: string;
    provider: string;
    description: string;
    webhookCount: number;
    productCount: number;
    flowCount: number;
    status: 'active' | 'inactive' | 'misconfigured';
    testMode: boolean;
    color: string;
  };

  const statusColors = {
    active: 'bg-green-400',
    inactive: 'bg-slate-300',
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
        {d.testMode && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            TEST
          </span>
        )}
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 mb-2">{d.description}</p>

      <div className="flex items-center gap-3 text-[9px] text-slate-400">
        <span className="flex items-center gap-0.5">
          <ArrowRightLeft className="h-2.5 w-2.5" /> {d.flowCount}
        </span>
        <span className="flex items-center gap-0.5">
          <Webhook className="h-2.5 w-2.5" /> {d.webhookCount}
        </span>
        <span className="flex items-center gap-0.5">
          <Package className="h-2.5 w-2.5" /> {d.productCount}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2" />
    </div>
  );
});

export const PaymentFlowNode = memo(function PaymentFlowNode({ data }: { data: unknown; selected?: boolean }) {
  const d = data as {
    name: string;
    type: string;
    description: string;
    stepCount: number;
    color: string;
  };

  const typeIcons: Record<string, string> = {
    checkout: '🛒',
    subscription: '🔄',
    'one-time': '💰',
    invoice: '📄',
    marketplace: '🏪',
    refund: '↩️',
    payout: '💸',
  };

  return (
    <div
      className="rounded-lg border-2 bg-white shadow-sm px-3 py-2.5 min-w-[180px] cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderColor: d.color }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-300 !w-2 !h-2" />

      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm">{typeIcons[d.type] ?? '💳'}</span>
        <span className="text-xs font-semibold text-slate-800 truncate">{d.name}</span>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 mb-1.5">{d.description}</p>

      <div className="flex items-center gap-1 text-[9px] text-slate-400">
        <CreditCard className="h-2.5 w-2.5" />
        <span>{d.stepCount} steps</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-slate-300 !w-2 !h-2" />
    </div>
  );
});
