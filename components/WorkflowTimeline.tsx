'use client'

import { useState, useRef, useCallback } from 'react'
import { ChevronRight, ChevronDown, Zap, GitBranch, Play, GitMerge, Globe, Bell, CheckCircle, XCircle, MinusCircle } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type SpanType = 'trigger' | 'workflow' | 'action' | 'condition' | 'api' | 'notification'
type SpanStatus = 'success' | 'error' | 'skipped'

interface Span {
  id: string
  name: string
  type: SpanType
  startMs: number
  durationMs: number
  status: SpanStatus
  input?: Record<string, unknown>
  output?: Record<string, unknown>
  children?: Span[]
}

interface FlatSpan extends Span {
  depth: number
  hasChildren: boolean
}

// ─── Mock trace data ──────────────────────────────────────────────────────────

const DEMO_TRACE: Span = {
  id: 'root',
  name: 'Button click — "Submit Form"',
  type: 'trigger',
  startMs: 0,
  durationMs: 487,
  status: 'success',
  input: { event: 'click', buttonId: 'submit-form', userId: 'usr_xyz9a2' },
  output: { triggered: true, workflowCount: 1 },
  children: [
    {
      id: 'wf-1',
      name: 'Handle form submission',
      type: 'workflow',
      startMs: 3,
      durationMs: 482,
      status: 'success',
      input: { formData: { email: 'alice@example.com', name: 'Alice Chen', plan: 'pro' } },
      output: { success: true, recordId: 'rec_abc123' },
      children: [
        {
          id: 'act-1',
          name: 'Get current user',
          type: 'api',
          startMs: 5,
          durationMs: 78,
          status: 'success',
          input: { userId: 'usr_xyz9a2' },
          output: { id: 'usr_xyz9a2', email: 'alice@example.com', role: 'admin', quota: { used: 158, limit: 1000 } },
        },
        {
          id: 'act-2',
          name: 'Validate form fields',
          type: 'action',
          startMs: 87,
          durationMs: 14,
          status: 'success',
          input: { fields: { email: 'alice@example.com', name: 'Alice Chen', plan: 'pro' }, rules: ['required', 'email_format'] },
          output: { valid: true, errors: [] },
        },
        {
          id: 'cond-1',
          name: 'Check user quota',
          type: 'condition',
          startMs: 105,
          durationMs: 31,
          status: 'success',
          input: { userId: 'usr_xyz9a2', action: 'create_record', currentUsage: 158 },
          output: { allowed: true, remaining: 842, branch: 'allowed' },
        },
        {
          id: 'wf-2',
          name: 'Save to database',
          type: 'workflow',
          startMs: 140,
          durationMs: 98,
          status: 'success',
          input: { table: 'submissions', data: { email: 'alice@example.com', name: 'Alice Chen', plan: 'pro' } },
          output: { recordId: 'rec_abc123', createdAt: '2026-04-29T14:23:11.000Z' },
          children: [
            {
              id: 'act-3',
              name: 'Insert record',
              type: 'action',
              startMs: 142,
              durationMs: 88,
              status: 'success',
              input: { table: 'submissions', values: { email: 'alice@example.com', name: 'Alice Chen', plan: 'pro', created_by: 'usr_xyz9a2' } },
              output: { id: 'rec_abc123', rowsAffected: 1, createdAt: '2026-04-29T14:23:11.000Z' },
            },
          ],
        },
        {
          id: 'wf-3',
          name: 'Send notifications',
          type: 'notification',
          startMs: 244,
          durationMs: 198,
          status: 'success',
          input: { recipients: ['alice@example.com', 'admin@example.com'], template: 'form_submitted', data: { name: 'Alice Chen', plan: 'pro' } },
          output: { sent: 2, failed: 0, messageIds: ['msg_001', 'msg_002'] },
          children: [
            {
              id: 'act-4',
              name: 'Format email content',
              type: 'action',
              startMs: 246,
              durationMs: 22,
              status: 'success',
              input: { template: 'form_submitted', vars: { name: 'Alice Chen', plan: 'pro', recordId: 'rec_abc123' } },
              output: { subject: 'Your form was submitted!', bodyHtml: '<p>Hi Alice Chen,</p>...', bodyText: 'Hi Alice Chen,...' },
            },
            {
              id: 'act-5',
              name: 'Send to alice@example.com',
              type: 'api',
              startMs: 272,
              durationMs: 104,
              status: 'success',
              input: { to: 'alice@example.com', subject: 'Your form was submitted!', provider: 'sendgrid' },
              output: { messageId: 'msg_001', status: 'delivered', timestamp: '2026-04-29T14:23:11.376Z' },
            },
            {
              id: 'act-6',
              name: 'Send to admin@example.com',
              type: 'api',
              startMs: 380,
              durationMs: 58,
              status: 'success',
              input: { to: 'admin@example.com', subject: 'New form submission from Alice Chen', provider: 'sendgrid' },
              output: { messageId: 'msg_002', status: 'delivered', timestamp: '2026-04-29T14:23:11.434Z' },
            },
          ],
        },
        {
          id: 'act-7',
          name: 'Update page state',
          type: 'action',
          startMs: 448,
          durationMs: 35,
          status: 'success',
          input: { mutation: 'show_success_banner', payload: { message: 'Submitted!', recordId: 'rec_abc123', duration: 4000 } },
          output: { stateUpdated: true, nextState: 'success' },
        },
      ],
    },
  ],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenSpans(span: Span, depth: number, collapsed: Set<string>): FlatSpan[] {
  const hasChildren = !!(span.children && span.children.length > 0)
  const result: FlatSpan[] = [{ ...span, depth, hasChildren }]
  if (hasChildren && !collapsed.has(span.id)) {
    for (const child of span.children!) {
      result.push(...flattenSpans(child, depth + 1, collapsed))
    }
  }
  return result
}

function countTotalSpans(span: Span): number {
  return 1 + (span.children?.reduce((sum, c) => sum + countTotalSpans(c), 0) ?? 0)
}

function getTickIntervalMs(totalMs: number): number {
  const targets = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000]
  const ideal = totalMs / 6
  return targets.find(t => t >= ideal) ?? targets[targets.length - 1]
}

// ─── Visual config ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<SpanType, { label: string; barColor: string; badgeColor: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = {
  trigger:      { label: 'Trigger',      barColor: 'bg-indigo-500',  badgeColor: 'bg-indigo-100 text-indigo-700',  Icon: Zap },
  workflow:     { label: 'Workflow',     barColor: 'bg-violet-500',  badgeColor: 'bg-violet-100 text-violet-700',  Icon: GitBranch },
  action:       { label: 'Action',       barColor: 'bg-emerald-500', badgeColor: 'bg-emerald-100 text-emerald-700', Icon: Play },
  condition:    { label: 'Condition',    barColor: 'bg-amber-500',   badgeColor: 'bg-amber-100 text-amber-700',    Icon: GitMerge },
  api:          { label: 'API call',     barColor: 'bg-sky-500',     badgeColor: 'bg-sky-100 text-sky-700',        Icon: Globe },
  notification: { label: 'Notification', barColor: 'bg-orange-500',  badgeColor: 'bg-orange-100 text-orange-700',  Icon: Bell },
}

const STATUS_ICON: Record<SpanStatus, React.ReactNode> = {
  success: <CheckCircle size={12} className="text-emerald-500 shrink-0" />,
  error:   <XCircle    size={12} className="text-red-500 shrink-0" />,
  skipped: <MinusCircle size={12} className="text-zinc-400 shrink-0" />,
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function JsonBlock({ data }: { data: Record<string, unknown> }) {
  return (
    <pre className="text-xs font-mono leading-relaxed text-zinc-700 whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  )
}

function TypeBadge({ type }: { type: SpanType }) {
  const { label, badgeColor } = TYPE_CONFIG[type]
  return (
    <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${badgeColor}`}>
      {label}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkflowTimeline() {
  const totalMs = DEMO_TRACE.durationMs
  const totalSpans = countTotalSpans(DEMO_TRACE)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<FlatSpan | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<SpanType | null>(null)
  const barAreaRef = useRef<HTMLDivElement>(null)

  const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const flatSpans = flattenSpans(DEMO_TRACE, 0, collapsed)
  const visibleSpans = filterType ? flatSpans.filter(s => s.type === filterType || s.type === 'trigger' || s.type === 'workflow') : flatSpans

  const tickInterval = getTickIntervalMs(totalMs)
  const ticks: number[] = []
  for (let t = 0; t <= totalMs; t += tickInterval) ticks.push(t)
  if (ticks[ticks.length - 1] < totalMs) ticks.push(totalMs)

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">

      {/* ── Header ── */}
      <div className="shrink-0 flex items-center gap-6 px-6 py-4 border-b border-zinc-200">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-0.5">Trace</p>
          <p className="text-sm font-semibold text-zinc-900">{DEMO_TRACE.name}</p>
        </div>
        <div className="h-8 w-px bg-zinc-200" />
        <Stat label="Duration" value={`${totalMs}ms`} />
        <Stat label="Spans" value={String(totalSpans)} />
        <Stat label="Workflows" value="2" />
        <Stat label="Status" value="Success" valueClass="text-emerald-600" />
        <div className="ml-auto flex items-center gap-1.5">
          {/* type filter pills */}
          {(['action', 'api', 'condition', 'notification'] as SpanType[]).map(t => {
            const { label, badgeColor } = TYPE_CONFIG[t]
            const active = filterType === t
            return (
              <button
                key={t}
                onClick={() => setFilterType(active ? null : t)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? `${badgeColor} border-transparent`
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Timeline grid ── */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="flex min-w-[700px]">

          {/* Left: name column */}
          <div className="w-[42%] shrink-0 border-r border-zinc-200">
            {/* column header */}
            <div className="sticky top-0 z-10 h-9 flex items-center px-4 bg-zinc-50 border-b border-zinc-200">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Span</span>
            </div>
            {visibleSpans.map(span => (
              <NameRow
                key={span.id}
                span={span}
                selected={selected?.id === span.id}
                hovered={hovered === span.id}
                collapsed={collapsed.has(span.id)}
                onSelect={() => setSelected(prev => prev?.id === span.id ? null : span)}
                onHover={setHovered}
                onToggle={toggleCollapse}
              />
            ))}
          </div>

          {/* Right: bar column */}
          <div className="flex-1 min-w-0" ref={barAreaRef}>
            {/* time axis */}
            <div className="sticky top-0 z-10 h-9 bg-zinc-50 border-b border-zinc-200 relative select-none">
              {ticks.map(t => {
                const pct = (t / totalMs) * 100
                return (
                  <div
                    key={t}
                    className="absolute top-0 bottom-0 flex flex-col justify-end pb-1"
                    style={{ left: `${pct}%`, transform: pct > 90 ? 'translateX(-100%)' : pct > 5 ? 'translateX(-50%)' : undefined }}
                  >
                    <span className="text-[10px] text-zinc-400 font-mono leading-none">{t}ms</span>
                  </div>
                )
              })}
              {/* tick lines */}
              {ticks.map(t => (
                <div
                  key={`line-${t}`}
                  className="absolute top-5 bottom-0 w-px bg-zinc-200"
                  style={{ left: `${(t / totalMs) * 100}%` }}
                />
              ))}
            </div>

            {/* bars */}
            {visibleSpans.map(span => (
              <BarRow
                key={span.id}
                span={span}
                totalMs={totalMs}
                selected={selected?.id === span.id}
                hovered={hovered === span.id}
                onSelect={() => setSelected(prev => prev?.id === span.id ? null : span)}
                onHover={setHovered}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Detail panel ── */}
      {selected && (
        <DetailPanel span={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}

// ─── NameRow ──────────────────────────────────────────────────────────────────

function NameRow({
  span, selected, hovered, collapsed,
  onSelect, onHover, onToggle,
}: {
  span: FlatSpan
  selected: boolean
  hovered: boolean
  collapsed: boolean
  onSelect: () => void
  onHover: (id: string | null) => void
  onToggle: (id: string, e: React.MouseEvent) => void
}) {
  const { Icon } = TYPE_CONFIG[span.type]
  const indentPx = span.depth * 20

  return (
    <div
      className={`flex items-center gap-2 h-9 px-3 cursor-pointer border-b border-zinc-100 transition-colors ${
        selected ? 'bg-indigo-50' : hovered ? 'bg-zinc-50' : ''
      }`}
      style={{ paddingLeft: `${12 + indentPx}px` }}
      onClick={onSelect}
      onMouseEnter={() => onHover(span.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* collapse toggle */}
      <div className="w-4 shrink-0">
        {span.hasChildren && (
          <button
            onClick={(e) => onToggle(span.id, e)}
            className="flex items-center justify-center w-4 h-4 text-zinc-400 hover:text-zinc-600"
          >
            {collapsed
              ? <ChevronRight size={12} />
              : <ChevronDown size={12} />
            }
          </button>
        )}
      </div>

      {/* type icon */}
      <Icon size={13} className="shrink-0 text-zinc-400" />

      {/* name */}
      <span className="flex-1 min-w-0 text-xs text-zinc-800 truncate font-medium">{span.name}</span>

      {/* status */}
      {STATUS_ICON[span.status]}
    </div>
  )
}

// ─── BarRow ───────────────────────────────────────────────────────────────────

function BarRow({
  span, totalMs, selected, hovered,
  onSelect, onHover,
}: {
  span: FlatSpan
  totalMs: number
  selected: boolean
  hovered: boolean
  onSelect: () => void
  onHover: (id: string | null) => void
}) {
  const { barColor } = TYPE_CONFIG[span.type]
  const leftPct = (span.startMs / totalMs) * 100
  const widthPct = Math.max((span.durationMs / totalMs) * 100, 0.3)

  return (
    <div
      className={`relative h-9 border-b border-zinc-100 cursor-pointer transition-colors ${
        selected ? 'bg-indigo-50' : hovered ? 'bg-zinc-50' : ''
      }`}
      onClick={onSelect}
      onMouseEnter={() => onHover(span.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* gridlines */}
      <div className="absolute inset-0 flex pointer-events-none opacity-30">
        {[0.25, 0.5, 0.75].map(f => (
          <div key={f} className="absolute top-0 bottom-0 w-px bg-zinc-200" style={{ left: `${f * 100}%` }} />
        ))}
      </div>

      {/* bar */}
      <div
        className={`absolute top-2.5 h-4 rounded-sm ${barColor} opacity-90 min-w-[2px]`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      />

      {/* duration label — only if bar is wide enough */}
      {widthPct > 8 && (
        <div
          className="absolute top-2.5 h-4 flex items-center px-1 pointer-events-none"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        >
          <span className="text-[10px] font-mono text-white leading-none truncate">
            {span.durationMs}ms
          </span>
        </div>
      )}

      {/* inline tooltip on hover */}
      {hovered && (
        <div
          className="absolute top-full mt-1 z-20 bg-zinc-900 text-white text-[11px] rounded px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none"
          style={{ left: `${Math.min(leftPct, 70)}%` }}
        >
          <span className="font-semibold">{span.name}</span>
          <span className="ml-2 opacity-70">{span.startMs}ms → {span.startMs + span.durationMs}ms</span>
          <span className="ml-2 font-mono opacity-90">{span.durationMs}ms</span>
        </div>
      )}
    </div>
  )
}

// ─── DetailPanel ──────────────────────────────────────────────────────────────

function DetailPanel({ span, onClose }: { span: FlatSpan; onClose: () => void }) {
  const { label, badgeColor, Icon } = TYPE_CONFIG[span.type]
  const [tab, setTab] = useState<'input' | 'output'>('input')

  return (
    <div className="shrink-0 border-t border-zinc-200 bg-zinc-50">
      {/* panel header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-zinc-200 bg-white">
        <Icon size={14} className="text-zinc-500 shrink-0" />
        <span className="text-sm font-semibold text-zinc-900 flex-1 truncate">{span.name}</span>
        <TypeBadge type={span.type} />
        <div className="flex items-center gap-1 text-xs text-zinc-500 font-mono">
          <span>{span.startMs}ms</span>
          <span>–</span>
          <span>{span.startMs + span.durationMs}ms</span>
          <span className="ml-1 font-semibold text-zinc-700">({span.durationMs}ms)</span>
        </div>
        {STATUS_ICON[span.status]}
        <button
          onClick={onClose}
          className="ml-2 text-zinc-400 hover:text-zinc-600 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* input / output tabs */}
      <div className="flex border-b border-zinc-200 bg-white px-5">
        {(['input', 'output'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`py-2 mr-4 text-xs font-semibold border-b-2 -mb-px transition-colors capitalize ${
              tab === t
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* data */}
      <div className="p-5 max-h-40 overflow-auto">
        {tab === 'input' && span.input
          ? <JsonBlock data={span.input} />
          : tab === 'output' && span.output
          ? <JsonBlock data={span.output} />
          : <p className="text-xs text-zinc-400 italic">No {tab} data recorded</p>
        }
      </div>
    </div>
  )
}

// ─── Stat ─────────────────────────────────────────────────────────────────────

function Stat({ label, value, valueClass = 'text-zinc-900' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-medium">{label}</p>
      <p className={`text-sm font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}
