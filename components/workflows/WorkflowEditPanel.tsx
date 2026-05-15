'use client';

import { memo } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { WorkflowState, WorkflowTransition, StateKind } from '@/lib/workflows/types';

const KIND_OPTIONS: { value: StateKind; label: string; color: string }[] = [
  { value: 'initial',  label: 'Start',    color: 'bg-slate-200 text-slate-700' },
  { value: 'active',   label: 'Active',   color: 'bg-blue-100 text-blue-700' },
  { value: 'review',   label: 'Review',   color: 'bg-amber-100 text-amber-700' },
  { value: 'terminal', label: 'Done',     color: 'bg-green-100 text-green-700' },
  { value: 'error',    label: 'Error',    color: 'bg-red-100 text-red-700' },
  { value: 'gateway',  label: 'Decision', color: 'bg-blue-50 text-blue-600' },
];

function StateEditPanel({ state, onUpdate, onDelete, onClose }: {
  state: WorkflowState;
  onUpdate: (patch: Partial<WorkflowState>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Edit State</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Label</Label>
        <Input
          value={state.label}
          onChange={e => onUpdate({ label: e.target.value })}
          className="h-7 text-xs font-mono"
          placeholder="STATE_LABEL"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Kind</Label>
        <div className="grid grid-cols-3 gap-1">
          {KIND_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ kind: opt.value })}
              className={cn(
                'text-[10px] py-1 px-1.5 rounded border transition-colors font-medium',
                state.kind === opt.value
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
          value={state.description ?? ''}
          onChange={e => onUpdate({ description: e.target.value })}
          className="w-full text-[10px] rounded-md border border-slate-200 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          rows={2}
          placeholder="Optional description…"
        />
      </div>

      <div className="pt-2 border-t border-slate-100">
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="w-full h-7 text-[10px] text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
        >
          <Trash2 className="h-3 w-3 mr-1.5" />
          Delete State
        </Button>
      </div>
    </div>
  );
}

function TransitionEditPanel({ transition, onUpdate, onDelete, onClose }: {
  transition: WorkflowTransition;
  onUpdate: (patch: Partial<WorkflowTransition>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Edit Transition</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Action</Label>
        <Input
          value={transition.action}
          onChange={e => onUpdate({ action: e.target.value })}
          className="h-7 text-xs"
          placeholder="e.g. Submit, Approve…"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Actors <span className="text-slate-400 font-normal">(comma-separated)</span></Label>
        <Input
          value={(transition.actors ?? []).join(', ')}
          onChange={e => onUpdate({ actors: e.target.value.split(',').map(a => a.trim()).filter(Boolean) })}
          className="h-7 text-xs"
          placeholder="e.g. ADMIN, OWNER"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Guards <span className="text-slate-400 font-normal">(comma-separated)</span></Label>
        <Input
          value={(transition.guards ?? []).join(', ')}
          onChange={e => onUpdate({ guards: e.target.value.split(',').map(g => g.trim()).filter(Boolean) })}
          className="h-7 text-xs"
          placeholder="e.g. reviewRequired = true"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">Side Effects <span className="text-slate-400 font-normal">(comma-separated)</span></Label>
        <Input
          value={(transition.sideEffects ?? []).join(', ')}
          onChange={e => onUpdate({ sideEffects: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
          className="h-7 text-xs"
          placeholder="e.g. email to assignee, Slack notification"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={transition.isRegression ?? false}
          onChange={e => onUpdate({ isRegression: e.target.checked })}
          className="h-3 w-3 rounded accent-amber-500 cursor-pointer"
        />
        <span className="text-[10px] text-slate-600">Regression (backward transition)</span>
      </label>

      <div className="pt-2 border-t border-slate-100">
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="w-full h-7 text-[10px] text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
        >
          <Trash2 className="h-3 w-3 mr-1.5" />
          Delete Transition
        </Button>
      </div>
    </div>
  );
}

interface Props {
  selectedState: WorkflowState | null;
  selectedTransition: WorkflowTransition | null;
  onUpdateState: (stateId: string, patch: Partial<WorkflowState>) => void;
  onUpdateTransition: (transId: string, patch: Partial<WorkflowTransition>) => void;
  onDeleteState: (stateId: string) => void;
  onDeleteTransition: (transId: string) => void;
  onClose: () => void;
}

export const WorkflowEditPanel = memo(function WorkflowEditPanel({
  selectedState,
  selectedTransition,
  onUpdateState,
  onUpdateTransition,
  onDeleteState,
  onDeleteTransition,
  onClose,
}: Props) {
  if (!selectedState && !selectedTransition) return null;

  return (
    <div className="absolute right-3 top-14 z-20 w-64 bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg overflow-hidden">
      {selectedState && (
        <StateEditPanel
          state={selectedState}
          onUpdate={patch => onUpdateState(selectedState.id, patch)}
          onDelete={() => onDeleteState(selectedState.id)}
          onClose={onClose}
        />
      )}
      {selectedTransition && !selectedState && (
        <TransitionEditPanel
          transition={selectedTransition}
          onUpdate={patch => onUpdateTransition(selectedTransition.id, patch)}
          onDelete={() => onDeleteTransition(selectedTransition.id)}
          onClose={onClose}
        />
      )}
    </div>
  );
});
