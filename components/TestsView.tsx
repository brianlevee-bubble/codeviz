'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import {
  Loader2,
  Play,
  PlayCircle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
  FileCode,
  Lightbulb,
  AlertCircle,
  RefreshCw,
  Terminal,
  FilePlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TestsAnalysis, TestSuggestion, ExistingTestFile, TestRunner, RunStatus } from '@/lib/test-runner/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function priorityColor(p: TestSuggestion['priority']) {
  return p === 'high' ? 'text-red-500' : p === 'medium' ? 'text-amber-500' : 'text-slate-400';
}

function categoryBadgeClass(c: TestSuggestion['category']) {
  switch (c) {
    case 'unit':        return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'component':   return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'api':         return 'bg-green-50 text-green-700 border-green-200';
    case 'integration': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'e2e':         return 'bg-rose-50 text-rose-700 border-rose-200';
    default:            return 'bg-slate-50 text-slate-600 border-slate-200';
  }
}

function runnerLabel(r: TestRunner) {
  switch (r) {
    case 'vitest':     return 'Vitest';
    case 'jest':       return 'Jest';
    case 'playwright': return 'Playwright';
    case 'cypress':    return 'Cypress';
    default:           return 'No runner';
  }
}

// ─── Terminal panel ───────────────────────────────────────────────────────────

function TerminalPanel({ lines, status }: { lines: string[]; status: RunStatus }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  return (
    <div className="flex-1 bg-zinc-950 rounded-b-xl overflow-auto font-mono text-xs text-zinc-300 p-3 min-h-0">
      {lines.length === 0 && status === 'idle' ? (
        <div className="flex items-center gap-2 text-zinc-600 mt-2">
          <Terminal className="h-4 w-4" />
          <span>Run a test to see output here</span>
        </div>
      ) : (
        lines.map((line, i) => (
          <div key={i} className={cn(
            'whitespace-pre-wrap break-all leading-5',
            line.startsWith('✅') && 'text-green-400',
            line.startsWith('❌') && 'text-red-400',
            line.startsWith('▶') && 'text-blue-400',
            line.startsWith('✏️') && 'text-yellow-400',
          )}>
            {line || '\u00A0'}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Existing test row ────────────────────────────────────────────────────────

function ExistingTestRow({
  testFile,
  onRun,
  runStatus,
}: {
  testFile: ExistingTestFile;
  onRun: (file: ExistingTestFile) => void;
  runStatus: RunStatus;
}) {
  const isRunning = runStatus === 'running';
  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 rounded-lg group">
      <FileCode className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <span className="flex-1 text-xs text-slate-700 font-mono truncate" title={testFile.relativePath}>
        {testFile.relativePath}
      </span>
      <span className="text-[10px] text-slate-400 shrink-0">
        {(testFile.sizeBytes / 1024).toFixed(1)}KB
      </span>
      <button
        onClick={() => onRun(testFile)}
        disabled={isRunning}
        className={cn(
          'opacity-0 group-hover:opacity-100 transition-opacity',
          'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium',
          'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200',
          isRunning && 'opacity-50 cursor-not-allowed'
        )}
      >
        {isRunning ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
        Run
      </button>
    </div>
  );
}

// ─── Suggestion card ──────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onRun,
  runStatus,
}: {
  suggestion: TestSuggestion;
  onRun: (s: TestSuggestion) => void;
  runStatus: RunStatus;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = runStatus === 'running';

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <button
        className="w-full flex items-start gap-2.5 p-3 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className={cn('mt-0.5 shrink-0', priorityColor(suggestion.priority))}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-slate-800">{suggestion.title}</span>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-medium', categoryBadgeClass(suggestion.category))}>
              {suggestion.category}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{suggestion.description}</p>
          {suggestion.targetFile && (
            <p className="text-[9px] text-slate-400 font-mono mt-0.5 truncate">↳ {suggestion.targetFile}</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100">
          {/* Suggested file path */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-100">
            <FilePlus className="h-3 w-3 text-slate-400" />
            <span className="text-[10px] font-mono text-slate-500">{suggestion.file}</span>
          </div>

          {/* Code block */}
          <pre className="text-[10px] font-mono text-slate-700 p-3 bg-slate-950/[0.03] overflow-x-auto leading-relaxed max-h-60">
            <code>{suggestion.code}</code>
          </pre>

          {/* Actions */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-100 bg-slate-50">
            <Button
              size="sm"
              onClick={() => onRun(suggestion)}
              disabled={isRunning}
              className="h-6 px-3 text-[10px] bg-green-600 hover:bg-green-700 text-white gap-1"
            >
              {isRunning
                ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Running…</>
                : <><FilePlus className="h-2.5 w-2.5" /> Create &amp; Run</>
              }
            </Button>
            <p className="text-[9px] text-slate-400">
              Will write to <code className="bg-slate-100 px-1 rounded">{suggestion.file}</code> then run
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_tests_v1_';

interface TestsCache {
  analysis: Omit<TestsAnalysis, 'suggestions'>;
  suggestions: TestSuggestion[];
}

function getCached(dirPath: string): TestsCache | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}
function setCached(dirPath: string, data: TestsCache) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(data)); } catch { /* quota */ }
}
export function clearTestsCache(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function TestsView() {
  const { directoryPath } = useGraphStore();

  // Analysis state
  const [analysis, setAnalysis] = useState<Omit<TestsAnalysis, 'suggestions'> | null>(null);
  const [suggestions, setSuggestions] = useState<TestSuggestion[]>([]);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'scanning' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const loadedForPath = useRef<string | null>(null);

  // Run state
  const [runLines, setRunLines] = useState<string[]>([]);
  const [runStatus, setRunStatus] = useState<RunStatus>('idle');
  const [runningId, setRunningId] = useState<string | null>(null); // testFile path or suggestion id

  // Sidebar section
  const [activeSection, setActiveSection] = useState<'existing' | 'suggested'>('suggested');

  const loadTests = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) {
        setAnalysis(cached.analysis);
        setSuggestions(cached.suggestions);
        setActiveSection(cached.suggestions.length > 0 ? 'suggested' : (cached.analysis.existingTests?.length > 0 ? 'existing' : 'suggested'));
        setLoadPhase('done');
        return;
      }
    }
    setLoadPhase('scanning');
    setLoadError(null);
    setSuggestions([]);
    setTokenBuffer('');

    const res = await fetch(`/api/tests?path=${encodeURIComponent(dirPath)}`);
    if (!res.ok || !res.body) {
      setLoadError('Failed to connect to tests API');
      setLoadPhase('error');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          switch (event.phase) {
            case 'scanning':
              setLoadPhase('scanning');
              break;
            case 'base':
              setAnalysis(event.data);
              setActiveSection(event.data.existingTests?.length > 0 ? 'existing' : 'suggested');
              break;
            case 'analyzing':
              setLoadPhase('analyzing');
              break;
            case 'token':
              setTokenBuffer(t => t + event.token);
              break;
            case 'complete': {
              const sugs: TestSuggestion[] = event.suggestions ?? [];
              setSuggestions(sugs);
              setLoadPhase('done');
              setTokenBuffer('');
              setActiveSection('suggested');
              // Write cache — need current analysis value via closure trick
              setAnalysis(prev => {
                if (prev) setCached(dirPath, { analysis: prev, suggestions: sugs });
                return prev;
              });
              break;
            }
            case 'error':
              setLoadError(event.error);
              setLoadPhase('error');
              break;
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }, []);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      loadTests(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  const runTest = useCallback(async (opts: {
    id: string;
    testFile?: string;
    testCode?: string;
    runner?: TestRunner;
    packageTestScript?: string | null;
  }) => {
    if (!directoryPath || runStatus === 'running') return;

    setRunLines([]);
    setRunStatus('running');
    setRunningId(opts.id);

    const body: Record<string, unknown> = {
      projectPath: directoryPath,
      runner: analysis?.runner ?? 'none',
      packageTestScript: analysis?.packageTestScript ?? null,
    };
    if (opts.testFile) body.testFile = opts.testFile;
    if (opts.testCode) body.testCode = opts.testCode;

    const res = await fetch('/api/tests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      setRunLines(['❌ Failed to start test run']);
      setRunStatus('error');
      setRunningId(null);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      for (const line of text.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'line') {
            setRunLines(prev => [...prev, event.text ?? '']);
          } else if (event.type === 'done') {
            setRunLines(prev => [...prev, '', event.text]);
            setRunStatus(event.exitCode === 0 ? 'passed' : 'failed');
            setRunningId(null);
          } else if (event.type === 'error') {
            setRunLines(prev => [...prev, `❌ ${event.text}`]);
            setRunStatus('error');
            setRunningId(null);
          }
        } catch { /* ignore */ }
      }
    }
  }, [directoryPath, runStatus, analysis]);

  const runAll = useCallback(() => {
    if (!analysis) return;
    runTest({ id: '__all__' });
  }, [analysis, runTest]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadPhase === 'idle' || (loadPhase === 'scanning' && !analysis)) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Scanning test files...</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'error' && !analysis) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500 max-w-sm text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => directoryPath && loadTests(directoryPath)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  const existingCount = analysis?.existingTests.length ?? 0;
  const suggestedCount = suggestions.length;
  const isAnalyzing = loadPhase === 'analyzing';

  return (
    <div className="flex-1 flex overflow-hidden">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-slate-200 flex flex-col bg-white overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Tests</h2>
            {analysis && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-medium">
                  {runnerLabel(analysis.runner)}
                </Badge>
                {analysis.runAllCommand && (
                  <code className="text-[9px] text-slate-400">{analysis.runAllCommand}</code>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => directoryPath && loadTests(directoryPath)}
              disabled={isAnalyzing}
              className="h-6 w-6 p-0 text-slate-400"
              title="Re-analyze"
            >
              <RefreshCw className={cn('h-3 w-3', isAnalyzing && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Run all */}
        {analysis && analysis.runner !== 'none' && (
          <div className="px-3 py-2 border-b border-slate-100">
            <Button
              size="sm"
              onClick={runAll}
              disabled={runStatus === 'running'}
              className="w-full h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {runStatus === 'running' && runningId === '__all__'
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
                : <><PlayCircle className="h-3 w-3" /> Run All Tests</>
              }
            </Button>
          </div>
        )}

        {/* Section tabs */}
        <div className="flex border-b border-slate-100">
          {[
            { key: 'existing' as const, label: `Existing (${existingCount})`, icon: FileCode },
            { key: 'suggested' as const, label: `Suggested${suggestedCount ? ` (${suggestedCount})` : ''}`, icon: Lightbulb },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
                activeSection === key
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto">
          {activeSection === 'existing' && (
            <div className="p-2 space-y-0.5">
              {existingCount === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No test files found</p>
              ) : (
                analysis?.existingTests.map((tf) => (
                  <ExistingTestRow
                    key={tf.relativePath}
                    testFile={tf}
                    onRun={(f) => runTest({ id: f.relativePath, testFile: f.relativePath })}
                    runStatus={runningId === tf.relativePath ? runStatus : 'idle'}
                  />
                ))
              )}
            </div>
          )}

          {activeSection === 'suggested' && (
            <div className="p-3 space-y-2">
              {isAnalyzing ? (
                <div className="py-6 flex flex-col items-center gap-2 text-slate-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <p className="text-xs text-center">Claude is analyzing your app…</p>
                  {tokenBuffer && (
                    <div className="w-full bg-slate-50 rounded p-2 text-[9px] font-mono text-slate-500 max-h-20 overflow-hidden">
                      {tokenBuffer.slice(-300)}
                    </div>
                  )}
                </div>
              ) : suggestedCount === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No suggestions yet</p>
              ) : (
                suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    onRun={(sg) => runTest({ id: sg.id, testFile: sg.file, testCode: sg.code })}
                    runStatus={runningId === s.id ? runStatus : 'idle'}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: terminal ───────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">

        {/* Terminal header */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-zinc-900 text-zinc-300">
          <Terminal className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Test Output</span>
          <div className="flex-1" />
          {runStatus === 'passed' && (
            <div className="flex items-center gap-1 text-green-400 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> All passed
            </div>
          )}
          {runStatus === 'failed' && (
            <div className="flex items-center gap-1 text-red-400 text-xs">
              <XCircle className="h-3.5 w-3.5" /> Failed
            </div>
          )}
          {runStatus === 'running' && (
            <div className="flex items-center gap-1 text-blue-400 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" /> Running…
            </div>
          )}
          {runLines.length > 0 && runStatus !== 'running' && (
            <button
              onClick={() => { setRunLines([]); setRunStatus('idle'); }}
              className="text-zinc-500 hover:text-zinc-300 text-[10px]"
            >
              Clear
            </button>
          )}
        </div>

        <TerminalPanel lines={runLines} status={runStatus} />
      </div>
    </div>
  );
}
