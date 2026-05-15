'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useGraphStore } from '@/lib/store/graph-store';
import { CheckCircle, FileText, Loader2 } from 'lucide-react';
import type { FileDiff } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

function computeLineDiff(before: string, after: string) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  const result: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string; lineNum: number }> = [];
  const maxLines = Math.max(beforeLines.length, afterLines.length);
  const CONTEXT = 3;
  const changedLines = new Set<number>();

  for (let i = 0; i < Math.max(beforeLines.length, afterLines.length); i++) {
    if (beforeLines[i] !== afterLines[i]) {
      for (let j = Math.max(0, i - CONTEXT); j <= Math.min(maxLines - 1, i + CONTEXT); j++) {
        changedLines.add(j);
      }
    }
  }

  let i = 0;
  while (i < Math.max(beforeLines.length, afterLines.length)) {
    if (!changedLines.has(i)) { i++; continue; }
    if (i < beforeLines.length && beforeLines[i] !== (afterLines[i] ?? '')) {
      result.push({ type: 'removed', text: beforeLines[i], lineNum: i + 1 });
    }
    if (i < afterLines.length && afterLines[i] !== (beforeLines[i] ?? '')) {
      result.push({ type: 'added', text: afterLines[i], lineNum: i + 1 });
    } else if (i < afterLines.length && afterLines[i] === beforeLines[i]) {
      result.push({ type: 'unchanged', text: afterLines[i], lineNum: i + 1 });
    }
    i++;
  }

  return result;
}

function DiffFile({ diff, approved, onToggle }: {
  diff: FileDiff;
  approved: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isNew = diff.before === '';
  const isDeleted = diff.after === '';

  const lines = isNew
    ? diff.after.split('\n').map((text, i) => ({ type: 'added' as const, text, lineNum: i + 1 }))
    : isDeleted
      ? diff.before.split('\n').map((text, i) => ({ type: 'removed' as const, text, lineNum: i + 1 }))
      : computeLineDiff(diff.before, diff.after);

  const addedCount = lines.filter((l) => l.type === 'added').length;
  const removedCount = lines.filter((l) => l.type === 'removed').length;

  return (
    <div className={`border rounded-lg overflow-hidden transition-opacity ${approved ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
      {/* File header — click anywhere to toggle approval */}
      <label className="flex items-center gap-2.5 px-3 py-2 bg-slate-50 border-b border-slate-200 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={approved}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded accent-blue-600 cursor-pointer shrink-0"
        />
        <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <span className="text-xs font-mono text-slate-700 flex-1 truncate">{diff.file}</span>
        <div className="flex items-center gap-1.5">
          {isNew && <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">new</Badge>}
          {isDeleted && <Badge className="text-[10px] bg-red-100 text-red-700 border-red-200">deleted</Badge>}
          {!isNew && !isDeleted && (
            <>
              <span className="text-[10px] text-green-600 font-medium">+{addedCount}</span>
              <span className="text-[10px] text-red-600 font-medium">-{removedCount}</span>
            </>
          )}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); setExpanded((v) => !v); }}
          className="text-xs text-slate-400 hover:text-slate-600 ml-1"
        >
          {expanded ? '▲' : '▼'}
        </button>
      </label>

      {expanded && (
        <div className="overflow-x-auto max-h-48">
          <table className="w-full text-xs font-mono border-collapse">
            <tbody>
              {lines.slice(0, 200).map((line, idx) => (
                <tr
                  key={idx}
                  className={
                    line.type === 'added' ? 'bg-green-50'
                    : line.type === 'removed' ? 'bg-red-50'
                    : 'bg-white'
                  }
                >
                  <td className="w-10 text-right text-slate-400 px-2 py-0.5 select-none border-r border-slate-100">
                    {line.lineNum}
                  </td>
                  <td className="w-5 text-center select-none text-slate-400 pr-2">
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </td>
                  <td className="px-2 py-0.5 whitespace-pre text-slate-800">{line.text}</td>
                </tr>
              ))}
              {lines.length > 200 && (
                <tr>
                  <td colSpan={3} className="text-center text-slate-400 py-2 text-xs">
                    … {lines.length - 200} more lines
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DiffViewer({ open, onClose, onApplied }: Props) {
  const {
    previewDiffs,
    directoryPath,
    isApplying,
    setIsApplying,
    clearPendingChanges,
  } = useGraphStore();

  const [approvedFiles, setApprovedFiles] = useState<Set<string>>(new Set());
  const [applyError, setApplyError] = useState('');
  const [applyResult, setApplyResult] = useState<{ success: string[]; errors: Array<{ file: string; error: string }> } | null>(null);

  // Sync approvedFiles whenever diffs arrive (all approved by default)
  useEffect(() => {
    if (previewDiffs && previewDiffs.length > 0) {
      setApprovedFiles(new Set(previewDiffs.map((d) => d.file)));
      setApplyError('');
      setApplyResult(null);
    }
  }, [previewDiffs]);

  function toggleFile(file: string) {
    setApprovedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file); else next.add(file);
      return next;
    });
  }

  function toggleAll() {
    if (!previewDiffs) return;
    if (approvedFiles.size === previewDiffs.length) {
      setApprovedFiles(new Set());
    } else {
      setApprovedFiles(new Set(previewDiffs.map((d) => d.file)));
    }
  }

  async function handleApply() {
    if (!previewDiffs || !directoryPath) return;
    setIsApplying(true);
    setApplyError('');
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directoryPath,
          diffs: previewDiffs,
          approvedFiles: Array.from(approvedFiles),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApplyError(data.error ?? 'Apply failed');
        return;
      }
      setApplyResult(data);
      if (data.errors?.length === 0) {
        clearPendingChanges();
        setTimeout(() => { onApplied(); onClose(); }, 1500);
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsApplying(false);
    }
  }

  if (!previewDiffs) return null;

  const allSelected = approvedFiles.size === previewDiffs.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Apply Changes
            <Badge variant="outline" className="text-xs font-normal">
              {previewDiffs.length} file{previewDiffs.length !== 1 ? 's' : ''}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {applyResult ? (
          <div className="py-2 space-y-2">
            {applyResult.success.length > 0 && (
              <div className="text-sm text-green-700 bg-green-50 rounded p-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Applied to {applyResult.success.length} file{applyResult.success.length !== 1 ? 's' : ''}
              </div>
            )}
            {applyResult.errors?.map((e) => (
              <div key={e.file} className="text-sm text-red-700 bg-red-50 rounded p-3">
                ✗ {e.file}: {e.error}
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Select-all row */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded accent-blue-600 cursor-pointer"
                />
                {allSelected ? 'Deselect all' : `Select all (${previewDiffs.length})`}
              </label>
              <span className="text-xs text-slate-400">
                {approvedFiles.size} of {previewDiffs.length} selected
              </span>
            </div>

            <ScrollArea className="flex-1 min-h-0 max-h-96">
              <div className="space-y-3 pr-2">
                {previewDiffs.map((diff) => (
                  <DiffFile
                    key={diff.file}
                    diff={diff}
                    approved={approvedFiles.has(diff.file)}
                    onToggle={() => toggleFile(diff.file)}
                  />
                ))}
              </div>
            </ScrollArea>

            {applyError && (
              <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{applyError}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
              <Button variant="outline" size="sm" onClick={onClose} disabled={isApplying}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={approvedFiles.size === 0 || isApplying}
                className="gap-1.5"
              >
                {isApplying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5" />
                )}
                {isApplying ? 'Applying…' : `Apply ${approvedFiles.size} file${approvedFiles.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
