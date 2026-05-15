// Fires all tab-level analyses in parallel and writes results to localStorage
// so each view finds the cache pre-populated when it mounts.

export type AnalysisId = 'tests' | 'security' | 'queries' | 'improvements' | 'api-contracts' | 'dead-code' | 'page-logic' | 'ui-flow' | 'roles-summaries' | 'workflows' | 'integrations' | 'backend-workflows' | 'payments';
export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error';
export type AnalysisProgressMap = Record<AnalysisId, AnalysisStatus>;

// Generic analysis: one `complete` event, one data field
interface SimpleAnalysisDef {
  kind: 'simple';
  id: AnalysisId;
  label: string;
  endpoint: (path: string) => string;
  cacheKey: (path: string) => string;
  dataField: string; // field on the `complete` event that holds the data
}

// Plain JSON endpoint (no SSE streaming)
interface JsonAnalysisDef {
  kind: 'json';
  id: AnalysisId;
  label: string;
  endpoint: (path: string) => string;
  cacheKey: (path: string) => string;
}

// Custom async runner (reads localStorage, does arbitrary fetch, etc.)
interface CustomAnalysisDef {
  kind: 'custom';
  id: AnalysisId;
  label: string;
  cacheKey: (path: string) => string;
  run: (path: string) => Promise<unknown>;
}

// Multi-event analysis: accumulates across several events then stores on `complete`
interface MultiAnalysisDef {
  id: AnalysisId;
  kind: 'multi';
  label: string;
  endpoint: (path: string) => string;
  cacheKey: (path: string) => string;
  // called for every SSE event — mutate `acc` and return true when ready to cache
  reduce: (ev: Record<string, unknown>, acc: Record<string, unknown>) => boolean;
}

type AnalysisDef = SimpleAnalysisDef | MultiAnalysisDef | JsonAnalysisDef | CustomAnalysisDef;

const ANALYSES: AnalysisDef[] = [
  {
    kind: 'multi',
    id: 'tests',
    label: 'Test Suggestions',
    endpoint: (p) => `/api/tests?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_tests_v1_${btoa(p)}`,
    reduce(ev, acc) {
      if (ev.phase === 'base') { acc.analysis = ev.data; }
      if (ev.phase === 'complete') { acc.suggestions = ev.suggestions ?? []; return true; }
      return false;
    },
  },
  {
    kind: 'simple',
    id: 'security',
    label: 'Security',
    endpoint: (p) => `/api/security?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_security_v1_${btoa(p)}`,
    dataField: 'graph',
  },
  {
    kind: 'simple',
    id: 'queries',
    label: 'List Queries',
    endpoint: (p) => `/api/queries?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_queries_v1_${btoa(p)}`,
    dataField: 'graph',
  },
  {
    kind: 'simple',
    id: 'improvements',
    label: 'Improvements',
    endpoint: (p) => `/api/improvements?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_improvements_v1_${btoa(unescape(encodeURIComponent(p)))}`,
    dataField: 'report',
  },
  {
    kind: 'simple',
    id: 'api-contracts',
    label: 'API Contracts',
    endpoint: (p) => `/api/api-contracts?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_apicontracts_v1_${btoa(p)}`,
    dataField: 'report',
  },
  {
    kind: 'simple',
    id: 'dead-code',
    label: 'Dead Code',
    endpoint: (p) => `/api/dead-code?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_deadcode_v1_${btoa(p)}`,
    dataField: 'report',
  },
  {
    kind: 'multi',
    id: 'page-logic',
    label: 'Page Logic',
    endpoint: (p) => `/api/page-logic?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_pagelogic_v1_${btoa(p)}`,
    reduce(ev, acc) {
      if (ev.phase === 'route') {
        acc[ev.route as string] = ev.summary;
      }
      if (ev.phase === 'complete') {
        // Merge any routes included in the complete payload
        const routes = (ev.routes ?? {}) as Record<string, string>;
        Object.assign(acc, routes);
        return true;
      }
      return false;
    },
  },
  {
    kind: 'json',
    id: 'ui-flow',
    label: 'UI Flow',
    endpoint: (p) => `/api/ui-flow?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_uiflow_v1_${btoa(p)}`,
  },
  {
    kind: 'simple',
    id: 'integrations',
    label: 'Integrations',
    endpoint: (p) => `/api/integrations?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_integrations_v1_${btoa(p)}`,
    dataField: 'graph',
  },
  {
    kind: 'simple',
    id: 'workflows',
    label: 'Workflows',
    endpoint: (p) => `/api/workflows?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_workflows_v3_${btoa(p)}`,
    dataField: 'workflows',
  },
  {
    kind: 'simple',
    id: 'backend-workflows',
    label: 'Backend Workflows',
    endpoint: (p) => `/api/backend-workflows?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_backendworkflows_v1_${btoa(p)}`,
    dataField: 'workflows',
  },
  {
    kind: 'simple',
    id: 'payments',
    label: 'Payments',
    endpoint: (p) => `/api/payments?path=${encodeURIComponent(p)}`,
    cacheKey: (p) => `codeviz_payments_v1_${btoa(p)}`,
    dataField: 'graph',
  },
  {
    kind: 'custom',
    id: 'roles-summaries',
    label: 'Role Summaries',
    cacheKey: (p) => `codeviz_rolessummaries_v1_${btoa(p)}`,
    async run(path) {
      // Wait up to 60s for security analysis to be cached first
      const secKey = `codeviz_security_v1_${btoa(path)}`;
      let graph = null;
      for (let i = 0; i < 120; i++) {
        try {
          const raw = localStorage.getItem(secKey);
          if (raw) { graph = JSON.parse(raw); break; }
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, 500));
      }
      if (!graph) throw new Error('Security analysis timed out');

      const res = await fetch('/api/roles-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graph }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  },
];

export function clearAllTabCaches(dirPath: string) {
  for (const a of ANALYSES) {
    try { localStorage.removeItem(a.cacheKey(dirPath)); } catch { /* ignore */ }
  }
  // Clear element-level logic caches
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('codeviz_elementlogic_v1_')) localStorage.removeItem(key);
    }
  } catch { /* ignore */ }
}

async function runOne(
  def: AnalysisDef,
  dirPath: string,
  onStatus: (id: AnalysisId, status: AnalysisStatus) => void,
): Promise<void> {
  // Skip if already cached
  try {
    if (localStorage.getItem(def.cacheKey(dirPath))) {
      onStatus(def.id, 'done');
      return;
    }
  } catch { /* ignore */ }

  onStatus(def.id, 'running');
  try {
    if (def.kind === 'custom') {
      const data = await def.run(dirPath);
      localStorage.setItem(def.cacheKey(dirPath), JSON.stringify(data));
      onStatus(def.id, 'done');
      return;
    }

    if (def.kind === 'json') {
      const res = await fetch(def.endpoint(dirPath));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      localStorage.setItem(def.cacheKey(dirPath), JSON.stringify(data));
      onStatus(def.id, 'done');
      return;
    }

    const res = await fetch(def.endpoint(dirPath));
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const acc: Record<string, unknown> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6)) as Record<string, unknown>;
          if (ev.phase === 'error') throw new Error(String(ev.error ?? 'error'));

          if (def.kind === 'simple') {
            if (ev.phase === 'complete') {
              const data = ev[def.dataField];
              if (data !== undefined) {
                localStorage.setItem(def.cacheKey(dirPath), JSON.stringify(data));
              }
              onStatus(def.id, 'done');
            }
          } else {
            if (def.reduce(ev, acc)) {
              localStorage.setItem(def.cacheKey(dirPath), JSON.stringify(acc));
              onStatus(def.id, 'done');
            }
          }
        } catch (err) {
          throw err;
        }
      }
    }
    // Stream ended — if not already marked done, mark done
    onStatus(def.id, 'done');
  } catch {
    onStatus(def.id, 'error');
  }
}

export function analyzeAll(
  dirPath: string,
  onStatus: (id: AnalysisId, status: AnalysisStatus) => void,
): void {
  for (const def of ANALYSES) {
    runOne(def, dirPath, onStatus);
  }
}

export const ANALYSIS_LABELS: Record<AnalysisId, string> = Object.fromEntries(
  ANALYSES.map((a) => [a.id, a.label])
) as Record<AnalysisId, string>;
