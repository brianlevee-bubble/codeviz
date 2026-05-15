'use client';

import { useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import { AGENTS, type AgentId, type AgentRun } from '@/lib/agents/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Copy, Play, Loader2, RotateCcw, Check, Download } from 'lucide-react';

// ── localStorage helpers ──────────────────────────────────────────────────────

function storageKey(dirPath: string) {
  return `codeviz_agents_v1_${btoa(dirPath)}`;
}

function emptyAgentHistory(): Record<AgentId, AgentRun[]> {
  return { 'test-writer': [], changelog: [], reviewer: [], 'doc-writer': [] };
}

function getHistory(dirPath: string): Record<AgentId, AgentRun[]> {
  try {
    const raw = localStorage.getItem(storageKey(dirPath));
    if (!raw) return emptyAgentHistory();
    return { ...emptyAgentHistory(), ...JSON.parse(raw) };
  } catch {
    return emptyAgentHistory();
  }
}

function addRun(dirPath: string, run: AgentRun) {
  const history = getHistory(dirPath);
  const runs = [run, ...(history[run.agentId] ?? [])].slice(0, 10);
  history[run.agentId] = runs;
  localStorage.setItem(storageKey(dirPath), JSON.stringify(history));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Config defaults per agent ─────────────────────────────────────────────────

function defaultConfig(agentId: AgentId): Record<string, string> {
  switch (agentId) {
    case 'test-writer': return { file: '' };
    case 'changelog': {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { since: d.toISOString().split('T')[0] };
    }
    case 'reviewer': return { file: '', focus: 'all' };
    case 'doc-writer': return { file: '', type: 'both' };
    default: return {};
  }
}

function buildUrl(agentId: AgentId, dirPath: string, config: Record<string, string>): string {
  const params = new URLSearchParams({ path: dirPath, ...config });
  return `/api/agents/${agentId}?${params.toString()}`;
}

function buildRunLabel(agentId: AgentId, config: Record<string, string>): string {
  switch (agentId) {
    case 'test-writer': return config.file ? `${config.file} → tests` : 'untitled';
    case 'changelog': return `since ${config.since || '30d ago'}`;
    case 'reviewer': return config.file ? `${config.file} (${config.focus || 'all'})` : 'untitled';
    case 'doc-writer': return config.file ? `${config.file} (${config.type || 'both'})` : 'untitled';
    default: return 'run';
  }
}

// ── Markdown renderer (simple) ────────────────────────────────────────────────

function MarkdownOutput({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-sm font-semibold text-slate-200 mt-4 mb-1.5 first:mt-0">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-xs font-semibold text-slate-300 mt-3 mb-1">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={i} className="text-xs text-slate-300 ml-4 list-disc leading-relaxed">
          {line.slice(2)}
        </li>
      );
    } else if (line.startsWith('```')) {
      // Collect code block
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="text-xs text-green-300 bg-slate-900 rounded p-2 my-2 overflow-x-auto whitespace-pre-wrap font-mono">
          {codeLines.join('\n')}
        </pre>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />);
    } else {
      // Inline bold: **text**
      const parts = line.split(/\*\*([^*]+)\*\*/g);
      elements.push(
        <p key={i} className="text-xs text-slate-300 leading-relaxed">
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-slate-100 font-semibold">{p}</strong> : p)}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function AgentsView() {
  const { directoryPath } = useGraphStore();

  const [selectedAgent, setSelectedAgent] = useState<AgentId>('test-writer');
  const [config, setConfig] = useState<Record<string, string>>(defaultConfig('test-writer'));
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [streamBuffer, setStreamBuffer] = useState('');
  const [output, setOutput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [history, setHistory] = useState<Record<AgentId, AgentRun[]>>(emptyAgentHistory);
  const [copied, setCopied] = useState(false);
  const [viewingRun, setViewingRun] = useState<AgentRun | null>(null);

  const outputRef = useRef<HTMLDivElement>(null);

  // Load history from localStorage
  useEffect(() => {
    if (directoryPath) {
      setHistory(getHistory(directoryPath));
    }
  }, [directoryPath]);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [streamBuffer]);

  function selectAgent(id: AgentId) {
    setSelectedAgent(id);
    setConfig(defaultConfig(id));
    setStatus('idle');
    setStreamBuffer('');
    setOutput('');
    setErrorMsg('');
    setViewingRun(null);
  }

  function setConfigVal(key: string, value: string) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }

  async function handleRun() {
    if (!directoryPath) return;
    setStatus('running');
    setStreamBuffer('');
    setOutput('');
    setErrorMsg('');
    setViewingRun(null);

    const url = buildUrl(selectedAgent, directoryPath, config);

    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalOutput = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.phase === 'token') {
              setStreamBuffer(prev => prev + event.token);
            } else if (event.phase === 'complete') {
              finalOutput = event.output ?? '';
              setOutput(finalOutput);
              setStatus('done');
              // Save to history
              const run: AgentRun = {
                id: `${selectedAgent}_${Date.now()}`,
                agentId: selectedAgent,
                label: buildRunLabel(selectedAgent, config),
                output: finalOutput,
                ranAt: new Date().toISOString(),
                status: 'done',
              };
              addRun(directoryPath, run);
              setHistory(getHistory(directoryPath));
            } else if (event.phase === 'error') {
              setErrorMsg(event.error ?? 'Unknown error');
              setStatus('error');
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Network error');
      setStatus('error');
    }
  }

  function handleCopy() {
    const text = viewingRun ? viewingRun.output : output || streamBuffer;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleNewRun() {
    setStatus('idle');
    setStreamBuffer('');
    setOutput('');
    setErrorMsg('');
    setViewingRun(null);
  }

  function handleSave() {
    const text = viewingRun ? viewingRun.output : output;
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const agent = AGENTS.find(a => a.id === selectedAgent);
    a.download = agent?.outputLabel.toLowerCase().replace(/ /g, '-') + '.txt';
    a.click();
  }

  const agentDef = AGENTS.find(a => a.id === selectedAgent)!;
  const agentHistory = history[selectedAgent] ?? [];
  const displayText = viewingRun ? viewingRun.output : (status === 'done' ? output : streamBuffer);
  const isMarkdown = agentDef.outputFormat === 'markdown';

  return (
    <div className="flex flex-1 overflow-hidden bg-white">
      {/* ── Left sidebar: agent cards ────────────────────────── */}
      <div className="w-56 shrink-0 border-r border-slate-200 flex flex-col overflow-hidden bg-slate-50">
        <div className="px-3 py-3 border-b border-slate-200">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Agents</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Automation tools for your project</p>
        </div>

        <div className="flex-1 overflow-y-auto py-2 space-y-1 px-2">
          {AGENTS.map(agent => {
            const runs = history[agent.id] ?? [];
            return (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent.id)}
                className={cn(
                  'w-full text-left px-3 py-2.5 rounded-lg transition-all border',
                  selectedAgent === agent.id
                    ? 'bg-white border-blue-200 shadow-sm'
                    : 'border-transparent hover:bg-white hover:border-slate-200'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-lg leading-none mt-0.5">{agent.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-xs font-semibold truncate',
                      selectedAgent === agent.id ? 'text-blue-700' : 'text-slate-700'
                    )}>
                      {agent.label}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-snug mt-0.5 line-clamp-2">
                      {agent.tagline}
                    </p>
                  </div>
                  {runs.length > 0 && (
                    <span className="shrink-0 text-[9px] font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full">
                      {runs.length}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Zone 1: Config panel */}
        <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">{agentDef.icon}</span>
                <h2 className="text-sm font-semibold text-slate-900">{agentDef.label}</h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{agentDef.tagline}</p>
            </div>
          </div>

          <div className="mt-3 flex items-end gap-3 flex-wrap">
            {/* Config fields */}
            {selectedAgent === 'test-writer' && (
              <div className="flex-1 min-w-48">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Source file</label>
                <input
                  type="text"
                  value={config.file ?? ''}
                  onChange={e => setConfigVal('file', e.target.value)}
                  placeholder="components/Button.tsx"
                  className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                />
              </div>
            )}

            {selectedAgent === 'changelog' && (
              <div className="flex-1 min-w-48">
                <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Since date</label>
                <input
                  type="date"
                  value={config.since ?? ''}
                  onChange={e => setConfigVal('since', e.target.value)}
                  className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            )}

            {selectedAgent === 'reviewer' && (
              <>
                <div className="flex-1 min-w-48">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Source file</label>
                  <input
                    type="text"
                    value={config.file ?? ''}
                    onChange={e => setConfigVal('file', e.target.value)}
                    placeholder="components/Button.tsx"
                    className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Focus</label>
                  <select
                    value={config.focus ?? 'all'}
                    onChange={e => setConfigVal('focus', e.target.value)}
                    className="mt-1 text-xs border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="all">All issues</option>
                    <option value="bugs">Bugs</option>
                    <option value="security">Security</option>
                    <option value="performance">Performance</option>
                  </select>
                </div>
              </>
            )}

            {selectedAgent === 'doc-writer' && (
              <>
                <div className="flex-1 min-w-48">
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Source file</label>
                  <input
                    type="text"
                    value={config.file ?? ''}
                    onChange={e => setConfigVal('file', e.target.value)}
                    placeholder="components/Button.tsx"
                    className="mt-1 w-full text-xs border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Output type</label>
                  <select
                    value={config.type ?? 'both'}
                    onChange={e => setConfigVal('type', e.target.value)}
                    className="mt-1 text-xs border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
                  >
                    <option value="both">JSDoc + README</option>
                    <option value="jsdoc">JSDoc only</option>
                    <option value="readme">README only</option>
                  </select>
                </div>
              </>
            )}

            {/* Run button */}
            <Button
              size="sm"
              onClick={handleRun}
              disabled={status === 'running'}
              className="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0"
            >
              {status === 'running' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {status === 'running' ? 'Running…' : 'Run'}
            </Button>
          </div>
        </div>

        {/* Zone 2: Output panel */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-900 min-h-0">

          {/* Output toolbar */}
          {(status === 'done' || viewingRun) && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-slate-800 border-b border-slate-700">
              <span className="text-[10px] text-slate-400 flex-1">
                {viewingRun
                  ? `Viewing: ${viewingRun.label}`
                  : `${agentDef.outputLabel} · ${output.split('\n').length} lines`
                }
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <Download className="h-3 w-3" />
                Save
              </button>
              <button
                onClick={handleNewRun}
                className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                New run
              </button>
            </div>
          )}

          {/* Output content */}
          <div ref={outputRef} className="flex-1 overflow-y-auto p-4">
            {status === 'idle' && !viewingRun && (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <span className="text-4xl">{agentDef.icon}</span>
                  <p className="text-sm text-slate-500 mt-3">{agentDef.outputLabel} will appear here</p>
                  <p className="text-xs text-slate-600 mt-1">Configure options above and click Run</p>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="text-red-400 text-sm font-medium">{errorMsg}</div>
                <button
                  onClick={handleNewRun}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  Try again
                </button>
              </div>
            )}

            {(status === 'running' || status === 'done' || viewingRun) && (
              <div className="min-h-full">
                {isMarkdown ? (
                  <MarkdownOutput text={displayText} />
                ) : (
                  <pre className="text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                    {displayText}
                    {status === 'running' && (
                      <span className="inline-block w-1.5 h-3.5 bg-slate-400 ml-0.5 animate-pulse" />
                    )}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Zone 3: Run history */}
        <div className="shrink-0 border-t border-slate-200 bg-white" style={{ maxHeight: '160px', overflowY: 'auto' }}>
          <div className="px-4 py-2 flex items-center gap-2 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Run history</p>
            {agentHistory.length > 0 && (
              <span className="text-[10px] text-slate-400">({agentHistory.length})</span>
            )}
          </div>

          {agentHistory.length === 0 ? (
            <p className="text-[10px] text-slate-400 px-4 py-2">No runs yet</p>
          ) : (
            <div>
              {agentHistory.map(run => (
                <div
                  key={run.id}
                  className="flex items-center gap-3 px-4 py-1.5 hover:bg-slate-50 transition-colors"
                >
                  <span className="text-[10px] text-slate-400 shrink-0 w-16">{timeAgo(run.ranAt)}</span>
                  <span className="text-[10px] text-slate-600 flex-1 truncate font-mono">{run.label}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] px-1.5 py-0 h-4 shrink-0',
                      run.status === 'done' ? 'text-green-600 border-green-200 bg-green-50' : 'text-red-600 border-red-200 bg-red-50'
                    )}
                  >
                    {run.status}
                  </Badge>
                  <button
                    onClick={() => {
                      setViewingRun(viewingRun?.id === run.id ? null : run);
                      if (viewingRun?.id !== run.id) setStatus('done');
                    }}
                    className="text-[10px] text-blue-500 hover:text-blue-700 shrink-0"
                  >
                    {viewingRun?.id === run.id ? 'Hide' : 'View'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
