'use client';

import { memo } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { BackendStep, BackendConnection, StepKind } from '@/lib/backend-workflows/types';

const KIND_OPTIONS: { value: StepKind; label: string; color: string }[] = [
  { value: 'trigger',       label: 'Trigger',     color: 'bg-emerald-100 text-emerald-700' },
  { value: 'process',       label: 'Process',     color: 'bg-blue-100 text-blue-700' },
  { value: 'data',          label: 'Data',        color: 'bg-violet-100 text-violet-700' },
  { value: 'integration',   label: 'Integration', color: 'bg-orange-100 text-orange-700' },
  { value: 'decision',      label: 'Decision',    color: 'bg-amber-100 text-amber-700' },
  { value: 'output',        label: 'Output',      color: 'bg-cyan-100 text-cyan-700' },
  { value: 'error-handler', label: 'Error',       color: 'bg-red-100 text-red-700' },
];

function StepEditPanel({ step, onUpdate, onDelete, onClose }: {
  step: BackendStep;
  onUpdate: (patch: Partial<BackendStep>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Edit Step</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Label</Label>
        <Input
          value={step.label}
          onChange={e => onUpdate({ label: e.target.value })}
          className="h-7 text-xs"
          placeholder="Step name"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Kind</Label>
        <div className="grid grid-cols-2 gap-1">
          {KIND_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ kind: opt.value })}
              className={cn(
                'text-[10px] py-1 px-1.5 rounded border transition-colors font-medium',
                step.kind === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : `${opt.color} border-transparent hover:border-slate-300`
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Description</Label>
        <textarea
          value={step.description ?? ''}
          onChange={e => onUpdate({ description: e.target.value })}
          className="w-full text-[10px] rounded-md border border-slate-200 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          rows={2}
          placeholder="What does this step do?"
        />
      </div>

      <div className="pt-2 border-t border-slate-100">
        <Button
          variant="outline" size="sm" onClick={onDelete}
          className="w-full h-7 text-[10px] text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
        >
          <Trash2 className="h-3 w-3 mr-1.5" /> Delete Step
        </Button>
      </div>
    </div>
  );
}

function ConnectionEditPanel({ connection, onUpdate, onDelete, onClose }: {
  connection: BackendConnection;
  onUpdate: (patch: Partial<BackendConnection>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Edit Connection</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Label</Label>
        <Input
          value={connection.label ?? ''}
          onChange={e => onUpdate({ label: e.target.value })}
          className="h-7 text-xs"
          placeholder="e.g. on success"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Condition</Label>
        <Input
          value={connection.condition ?? ''}
          onChange={e => onUpdate({ condition: e.target.value })}
          className="h-7 text-xs"
          placeholder="e.g. status === 200"
        />
      </div>

      <div className="pt-2 border-t border-slate-100">
        <Button
          variant="outline" size="sm" onClick={onDelete}
          className="w-full h-7 text-[10px] text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
        >
          <Trash2 className="h-3 w-3 mr-1.5" /> Delete Connection
        </Button>
      </div>
    </div>
  );
}

interface Props {
  selectedStep: BackendStep | null;
  selectedConnection: BackendConnection | null;
  onUpdateStep: (stepId: string, patch: Partial<BackendStep>) => void;
  onUpdateConnection: (connId: string, patch: Partial<BackendConnection>) => void;
  onDeleteStep: (stepId: string) => void;
  onDeleteConnection: (connId: string) => void;
  onClose: () => void;
}

export const BackendEditPanel = memo(function BackendEditPanel({
  selectedStep, selectedConnection,
  onUpdateStep, onUpdateConnection,
  onDeleteStep, onDeleteConnection,
  onClose,
}: Props) {
  if (!selectedStep && !selectedConnection) return null;

  return (
    <div className="absolute right-3 top-14 z-20 w-64 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg overflow-hidden">
      {selectedStep && (
        <StepEditPanel
          step={selectedStep}
          onUpdate={patch => onUpdateStep(selectedStep.id, patch)}
          onDelete={() => onDeleteStep(selectedStep.id)}
          onClose={onClose}
        />
      )}
      {selectedConnection && !selectedStep && (
        <ConnectionEditPanel
          connection={selectedConnection}
          onUpdate={patch => onUpdateConnection(selectedConnection.id, patch)}
          onDelete={() => onDeleteConnection(selectedConnection.id)}
          onClose={onClose}
        />
      )}
    </div>
  );
});
