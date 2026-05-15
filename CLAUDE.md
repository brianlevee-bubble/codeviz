# CodeViz

A local-first code visualization and editing tool. Point it at any Next.js/TypeScript project directory and it analyzes the codebase, generates interactive diagrams, and lets you make visual edits that write back to source files.

## Stack

- **Next.js 15** App Router + TypeScript, running at `localhost:3001`
- **`@xyflow/react` v12** — all diagram canvases (React Flow)
- **`@dagrejs/dagre`** — auto-layout for all React Flow views
- **`@anthropic-ai/sdk`** — Claude `claude-sonnet-4-5` for all analysis and generation
- **Zustand** (`lib/store/graph-store.ts`) — global state: `directoryPath`, `graphData`, `activeTab`, `pendingChanges`, etc.
- **shadcn/ui** + Tailwind CSS
- **`export const runtime = 'nodejs'`** — required on every API route (uses `fs`, `child_process`)

## Dev

```bash
npm run dev        # starts on :3000 (or :3001 if :3000 busy)
npx tsc --noEmit   # type check
```

**Known env issue**: dotenvx in the shell pre-sets `ANTHROPIC_API_KEY=""`. Fixed by `instrumentation.ts` which runs `dotenv.config({ override: true })` at Next.js startup. If you see "ANTHROPIC_API_KEY not configured", restart the dev server — do NOT edit `.env.local`.

## Architecture

### Entry flow

1. `app/page.tsx` — directory picker (`DirectoryInput.tsx`)
2. `app/canvas/page.tsx?path=…` → `CanvasLayout.tsx`
3. `CanvasLayout` runs initial analysis via `POST /api/analyze` (SSE) → `AnalysisProgress.tsx`
4. After analysis completes, renders the active tab view

### Tab system

All tabs defined in `components/canvas/FlowToolbar.tsx` (`TABS` array). Adding a new tab:
1. Add value to `CanvasTab` union in `lib/types.ts`
2. Add entry to `TABS` in `FlowToolbar.tsx` with a `group`
3. Add `if (activeTab === '…') return <YourView />;` in `CanvasLayout.tsx`
4. Add to `ANALYSES` in `lib/analyze-all.ts` to pre-populate cache on Re-analyze

**Tab groups**: Design · Database · Security · Quality · Code · Automate · Advanced (collapsible)

Current tabs and their views:

| Tab | Component | API Route | Cache key prefix |
|-----|-----------|-----------|-----------------|
| Visual Editor | `VisualEditorView` | `/api/visual-proxy`, `/api/visual-logic` | `codeviz_pagelogic_v1_` |
| UI Flow | `UIFlowView` | `/api/ui-flow` | `codeviz_uiflow_v1_` |
| Pages / All Pages | `PreviewTab`, `PagesGalleryView` | `/api/screenshot` | — |
| DB Schema | `SchemaView` | `/api/schema` | — |
| Data | `DataView` | `/api/data` | — |
| Roles | `RolesView` | `/api/roles-summaries` (POST) | `codeviz_rolessummaries_v1_` |
| Security | `SecurityView` | `/api/security` | `codeviz_security_v1_` |
| Tests | `TestsView` | `/api/tests` | `codeviz_tests_v1_` |
| Improvements | `ImprovementsView` | `/api/improvements` | `codeviz_improvements_v1_` |
| Workflows | `WorkflowsView` | `/api/workflows` | `codeviz_workflows_v1_` |
| API Contracts | `ApiContractsView` | `/api/api-contracts` | `codeviz_apicontracts_v1_` |
| Dead Code | `DeadCodeView` | `/api/dead-code` | `codeviz_deadcode_v1_` |
| Agents | `AgentsView` | `/api/agents/{test-writer,changelog,reviewer,doc-writer}` | `codeviz_agents_v1_` |
| List Queries | `QueriesView` | `/api/queries` | `codeviz_queries_v1_` |
| Architecture/DataFlow/StateMachine/Permissions | `FlowCanvas` | `/api/analyze` | `codeviz_analysis_` |

### SSE streaming pattern

All Claude-powered API routes follow the same pattern:

```typescript
export const runtime = 'nodejs';
// ...
const stream = new ReadableStream({
  async start(controller) {
    function emit(data: unknown) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    }
    emit({ phase: 'scanning', message: '…' });
    emit({ phase: 'analyzing', message: '…' });
    // stream tokens:
    for await (const event of claudeStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        emit({ phase: 'token', token: event.delta.text });
      }
    }
    emit({ phase: 'complete', /* data field varies */ });
  }
});
return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', ... } });
```

### localStorage caching

Every analysis view checks its cache key on mount; Re-analyze clears all via `clearAllTabCaches()` in `lib/analyze-all.ts`.

```typescript
const CACHE_KEY = `codeviz_FEATURE_v1_${btoa(dirPath)}`;
function getCached(dirPath: string): T | null { ... }
function setCached(dirPath: string, data: T) { ... }
```

### `lib/analyze-all.ts`

Fires all registered analyses **in parallel** and pre-populates localStorage so views load instantly. Used by the Re-analyze button in `FlowToolbar`. Supports four def kinds: `simple` (one SSE complete event), `multi` (accumulates events), `json` (plain JSON endpoint), `custom` (arbitrary async function).

### Editing pipeline (Visual Changes → Code)

1. Visual edits → `PendingChange[]` in Zustand store
2. "Apply Changes" → `POST /api/diff` → Claude generates `FileDiff[]`
3. `DiffViewer.tsx` shows before/after per file
4. User approves → `POST /api/apply` writes diffs to disk (path-guarded)

## Key files

```
app/
  page.tsx                        # Landing: directory input
  canvas/page.tsx                 # Main canvas (?path=)
  api/analyze/route.ts            # Initial SSE analysis → GraphData JSON
  api/visual-proxy/route.ts       # Proxies target app for Visual Editor
  api/visual-logic/route.ts       # Real-time element logic analysis (SSE)
  api/page-logic/route.ts         # Pre-analysis of all page routes (SSE)
  api/workflows/route.ts          # State machine extraction (SSE)
  api/workflows/…                 # (other API routes follow same pattern)
components/
  CanvasLayout.tsx                # Root canvas shell, tab routing, Re-analyze
  canvas/FlowToolbar.tsx          # Left sidebar: tab groups, progress indicators
  canvas/FlowCanvas.tsx           # Generic React Flow for architecture/dataflow views
  VisualEditorView.tsx            # Proxied iframe + element inspector + property panel
  WorkflowsView.tsx               # State machine diagram (custom nodes/edges)
  QueriesView.tsx                 # List queries diagram (reference pattern for new views)
  workflows/
    WorkflowStateNode.tsx         # Custom RF node: color-coded by StateKind
    WorkflowTransitionEdge.tsx    # Custom RF edge: action label + actor/guard badges
lib/
  types.ts                        # All shared types (CanvasTab, GraphData, PendingChange…)
  analyze-all.ts                  # Parallel pre-analysis registry
  store/graph-store.ts            # Zustand store
  workflows/types.ts              # WorkflowState, WorkflowTransition, Workflow types
  analyzer/
    file-reader.ts                # Directory walker (skips node_modules/.next/dist)
    chunker.ts                    # 2-phase: tree-only → top files → deep read
    claude-analyzer.ts            # Single Claude call → all 4 DiagramView graphs
    graph-builder.ts              # Zod validation + dagre layout per view
instrumentation.ts                # Runs dotenv.config({override:true}) at startup
```

## Adding a new tab (checklist)

1. `lib/types.ts` — add `'my-tab'` to `CanvasTab`
2. `lib/my-feature/types.ts` — define result types
3. `app/api/my-feature/route.ts` — SSE route, `export const runtime = 'nodejs'`
4. `components/MyFeatureView.tsx` — check cache → fetch SSE → render
5. `lib/analyze-all.ts` — add to `AnalysisId` union and `ANALYSES` array
6. `components/canvas/FlowToolbar.tsx` — add to `TABS` with a group
7. `components/CanvasLayout.tsx` — add `if (activeTab === 'my-tab') return <MyFeatureView />;`
8. `npx tsc --noEmit`

## Custom React Flow node/edge pattern

Use `data: unknown` with internal cast (not typed props) to satisfy `NodeTypes`/`EdgeTypes`:

```typescript
// Node
export const MyNode = memo(function MyNode({ data }: { data: unknown; selected?: boolean }) {
  const d = data as { label: string; ... };
  ...
});

// In view:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NODE_TYPES = { myNode: MyNode as any };
```

## Visual Editor notes

- Proxies target app via `/api/visual-proxy?url=…` with injected inspector script
- Inspector uses `postMessage` to communicate selected element info (tag, class, id, ancestors, styles, pageUrl) to the parent frame
- `history.pushState` is patched in the proxy to fire `CVIZ_NAVIGATE` for SPA navigation (only `pushState`, not `replaceState` — replaceState would cause infinite reload)
- Logic tab: checks `codeviz_pagelogic_v1_` cache first for pre-analyzed page context; "Analyze this element" button triggers real-time `/api/visual-logic` call
- Style scope toggle: "This element" = inline style; "All [selector]" = injects `<style id="cviz-rules">` into proxy iframe head

## Workflow visualization notes

- Detects `*Status`, `*State`, `*Phase` enums + transition logic via grep
- `StateKind`: `initial` (slate), `active` (blue), `review` (amber), `terminal` (green), `error` (red)
- Regression transitions (backward edges) rendered dashed amber
- Edge labels: action name + actor role badges (EDIT=blue, ADMIN=purple, OWNER=green) + guard chips (amber lock icon)
- Uses `getSmoothStepPath` for forward edges (orthogonal, non-overlapping), `getBezierPath` for regression arcs
