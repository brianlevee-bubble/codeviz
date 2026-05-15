'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FolderOpen, Clock, ArrowRight, X, Loader2 } from 'lucide-react';
import { FolderPickerDialog } from '@/components/FolderPickerDialog';
import { cn } from '@/lib/utils';

const RECENT_PATHS_KEY = 'codeviz_recent_paths';
const MAX_RECENT = 6;

function getRecentPaths(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_PATHS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function addRecentPath(p: string) {
  const recent = getRecentPaths().filter((r) => r !== p);
  recent.unshift(p);
  localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

function removeRecentPath(p: string) {
  const recent = getRecentPaths().filter((r) => r !== p);
  localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(recent));
}

// Shorten long paths for display: /Users/alice/Claude/my-project → ~/Claude/my-project
function displayPath(p: string): string {
  const home = p.match(/^\/(?:Users|home)\/[^/]+/)?.[0];
  return home ? p.replace(home, '~') : p;
}

// Get the project name (last segment) for emphasis
function projectName(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p;
}

export function DirectoryInput() {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);

  useEffect(() => {
    setRecentPaths(getRecentPaths());
  }, []);

  async function analyze(targetPath: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(targetPath)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Invalid path');
        return;
      }
      addRecentPath(targetPath);
      setRecentPaths(getRecentPaths());
      router.push(`/canvas?path=${encodeURIComponent(targetPath)}`);
    } catch {
      setError('Could not reach server');
    } finally {
      setLoading(false);
    }
  }

  function handlePicked(path: string) {
    setPickerOpen(false);
    setSelectedPath(path);
    setError('');
  }

  return (
    <div className="w-full space-y-5">

      {/* ── Picker trigger ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <button
          onClick={() => setPickerOpen(true)}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-4 rounded-xl border-2 border-dashed transition-all text-left',
            selectedPath
              ? 'border-blue-300 bg-blue-50 hover:border-blue-400'
              : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
          )}
        >
          <div className={cn(
            'p-2 rounded-lg shrink-0',
            selectedPath ? 'bg-blue-100' : 'bg-white border border-slate-200'
          )}>
            <FolderOpen className={cn('h-5 w-5', selectedPath ? 'text-blue-600' : 'text-slate-400')} />
          </div>

          {selectedPath ? (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {projectName(selectedPath)}
              </p>
              <p className="text-xs text-slate-500 font-mono truncate mt-0.5">
                {displayPath(selectedPath)}
              </p>
            </div>
          ) : (
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-600">Choose a project folder</p>
              <p className="text-xs text-slate-400 mt-0.5">Browse your file system to pick a directory</p>
            </div>
          )}

          {selectedPath ? (
            <span className="text-xs text-blue-500 font-medium shrink-0">Change</span>
          ) : (
            <span className="text-xs text-slate-400 shrink-0">Browse →</span>
          )}
        </button>

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1.5 px-1">
            <span>⚠</span> {error}
          </p>
        )}

        <Button
          onClick={() => selectedPath && analyze(selectedPath)}
          disabled={loading || !selectedPath}
          className="w-full h-11 gap-2 text-sm font-medium"
          size="lg"
        >
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>
            : <><span>Analyze Project</span><ArrowRight className="h-4 w-4" /></>
          }
        </Button>
      </div>

      {/* ── Recent paths ───────────────────────────────────────────────── */}
      {recentPaths.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            <span>Recent</span>
          </div>
          <div className="grid gap-1.5">
            {recentPaths.map((p) => (
              <div
                key={p}
                className="flex items-center gap-2.5 group rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 hover:bg-slate-100 hover:border-slate-200 transition-all cursor-pointer"
                onClick={() => analyze(p)}
              >
                <FolderOpen className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {projectName(p)}
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono truncate">
                    {displayPath(p)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeRecentPath(p);
                    setRecentPaths(getRecentPaths());
                  }}
                  className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-slate-500 transition-all p-1 rounded-lg hover:bg-slate-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Picker dialog ──────────────────────────────────────────────── */}
      <FolderPickerDialog
        open={pickerOpen}
        onSelect={handlePicked}
        onClose={() => setPickerOpen(false)}
        initialPath={selectedPath || undefined}
      />
    </div>
  );
}
