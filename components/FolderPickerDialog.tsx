'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, FolderOpen, ChevronRight, ArrowLeft, Home, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { BrowseResult, BrowseEntry } from '@/app/api/browse/route';

interface Props {
  open: boolean;
  onSelect: (path: string) => void;
  onClose: () => void;
  initialPath?: string;
}

const QUICK_ACCESS = [
  { label: '🏠 Home', path: null },         // null = server resolves to homedir
  { label: '💻 /Users', path: '/Users' },
  { label: '📁 /', path: '/' },
];

export function FolderPickerDialog({ open, onSelect, onClose, initialPath }: Props) {
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback(async (targetPath: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const url = targetPath
        ? `/api/browse?path=${encodeURIComponent(targetPath)}`
        : '/api/browse';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Cannot open folder');
        return;
      }
      setResult(data as BrowseResult);
      // Scroll list to top on navigation
      if (listRef.current) listRef.current.scrollTop = 0;
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load home dir when dialog opens
  useEffect(() => {
    if (open) {
      navigate(initialPath ?? null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keyboard: Escape to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const currentPath = result?.path ?? '';

  // Split path into breadcrumb segments
  function pathSegments(p: string) {
    const parts = p.split('/').filter(Boolean);
    return parts.map((part, i) => ({
      label: part,
      path: '/' + parts.slice(0, i + 1).join('/'),
    }));
  }

  const segments = currentPath ? pathSegments(currentPath) : [];

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Dialog */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden border border-slate-200"
           style={{ maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="p-1.5 rounded-lg bg-blue-50">
            <FolderOpen className="h-4 w-4 text-blue-600" />
          </div>
          <h2 className="font-semibold text-slate-900 text-sm flex-1">Open Project Folder</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick access */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 bg-slate-50">
          {QUICK_ACCESS.map(({ label, path: p }) => (
            <button
              key={label}
              onClick={() => navigate(p)}
              className="text-[10px] px-2 py-1 rounded-md text-slate-600 hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-0.5 px-4 py-2 border-b border-slate-100 min-h-[36px] overflow-x-auto">
          {result?.parent !== undefined && (
            <button
              onClick={() => result.parent && navigate(result.parent)}
              disabled={!result.parent}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 shrink-0"
              title="Go up"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => navigate(null)}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            title="Home"
          >
            <Home className="h-3.5 w-3.5" />
          </button>
          {segments.map((seg, i) => (
            <span key={seg.path} className="flex items-center shrink-0">
              <ChevronRight className="h-3 w-3 text-slate-300 mx-0.5" />
              <button
                onClick={() => navigate(seg.path)}
                className={cn(
                  'text-xs px-1.5 py-0.5 rounded transition-colors max-w-[120px] truncate',
                  i === segments.length - 1
                    ? 'font-semibold text-slate-800 bg-slate-100'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                )}
                title={seg.path}
              >
                {seg.label}
              </button>
            </span>
          ))}
        </div>

        {/* Directory list */}
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0 p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-500">
              <p className="text-sm">{error}</p>
              <button
                onClick={() => navigate(result?.parent ?? null)}
                className="text-xs text-blue-500 hover:underline"
              >
                Go back
              </button>
            </div>
          ) : result?.entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-2">
              <Folder className="h-8 w-8 opacity-40" />
              <p className="text-sm">No subfolders here</p>
              <p className="text-xs text-slate-400">Select this folder if it&apos;s your project</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {result?.entries.map((entry: BrowseEntry) => (
                <FolderRow
                  key={entry.path}
                  entry={entry}
                  isHovered={hoveredPath === entry.path}
                  onHover={setHoveredPath}
                  onOpen={navigate}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 truncate font-mono" title={currentPath}>
              {currentPath || 'Home'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => currentPath && onSelect(currentPath)}
            disabled={!currentPath || loading}
            className="h-8 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Check className="h-3.5 w-3.5" />
            Open This Folder
          </Button>
        </div>
      </div>
    </div>
  );
}

function FolderRow({
  entry,
  isHovered,
  onHover,
  onOpen,
  onSelect,
}: {
  entry: BrowseEntry;
  isHovered: boolean;
  onHover: (path: string | null) => void;
  onOpen: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group',
        isHovered ? 'bg-blue-50' : 'hover:bg-slate-50'
      )}
      onMouseEnter={() => onHover(entry.path)}
      onMouseLeave={() => onHover(null)}
      onDoubleClick={() => onOpen(entry.path)}
      onClick={() => onHover(entry.path)}
    >
      {/* Folder icon */}
      <div className="shrink-0">
        {isHovered
          ? <FolderOpen className="h-4 w-4 text-blue-500" />
          : <Folder className="h-4 w-4 text-amber-400" />
        }
      </div>

      {/* Name */}
      <span className={cn(
        'flex-1 text-sm truncate',
        isHovered ? 'text-blue-700 font-medium' : 'text-slate-700'
      )}>
        {entry.name}
      </span>

      {/* Actions: visible on hover */}
      <div className={cn(
        'flex items-center gap-1.5 transition-opacity',
        isHovered ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      )}>
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(entry.path); }}
          className="text-[10px] px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
        >
          Select
        </button>
        {entry.hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(entry.path); }}
            className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-0.5"
          >
            Open <ChevronRight className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}
