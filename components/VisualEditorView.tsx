'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Crosshair, MousePointer, RefreshCw, Monitor, Tablet, Smartphone,
  ChevronDown, Minus, Cpu, Loader2, RotateCcw, Plus, Copy, Check, FileCode,
  Send, RefreshCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGraphStore } from '@/lib/store/graph-store';
import { useApplyChanges } from '@/lib/hooks/use-apply-changes';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ElementStyles {
  color: string;
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  lineHeight: string;
  textAlign: string;
  letterSpacing: string;
  textDecorationLine: string;
  backgroundColor: string;
  opacity: string;
  paddingTop: string; paddingRight: string; paddingBottom: string; paddingLeft: string;
  marginTop: string;  marginRight: string;  marginBottom: string;  marginLeft: string;
  borderRadius: string;
  borderWidth: string;
  borderColor: string;
  borderStyle: string;
  display: string;
  flexDirection: string;
  gap: string;
  alignItems: string;
  justifyContent: string;
  width: string;
  height: string;
  boxShadow: string;
}

interface AncestorInfo {
  tagName: string;
  id: string | null;
  className: string;
  ariaLabel: string | null;
  role: string | null;
  dataAttrs: Record<string, string>;
}

interface ExprToken {
  kind: 'source' | 'property' | 'filter' | 'aggregate' | 'op' | 'value';
  label: string;
}

interface ReactSource {
  fileName: string;
  lineNumber: number | null;
  columnNumber: number | null;
  componentName: string | null;
}

interface SelectedElement {
  tagName: string;
  id: string | null;
  className: string;
  textContent: string;
  ariaLabel: string | null;
  role: string | null;
  dataAttrs: Record<string, string>;
  outerHTMLSnippet: string;
  pageUrl: string;
  ancestors: AncestorInfo[];
  styles: ElementStyles;
  reactSource?: ReactSource | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rgbToHex(rgb: string): string {
  const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return '#000000';
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function isTransparent(c: string) {
  return !c || c === 'transparent' || /rgba?\(0,\s*0,\s*0,\s*0\)/.test(c) || c === 'rgba(0, 0, 0, 0)';
}

function pxVal(px: string): number {
  return parseFloat(px) || 0;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Property controls ────────────────────────────────────────────────────────

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const transp = isTransparent(value);
  const hex = transp ? '#ffffff' : (value.startsWith('#') ? value : rgbToHex(value));
  const swatch = transp
    ? { backgroundImage: 'linear-gradient(45deg,#ccc 25%,transparent 25%),linear-gradient(-45deg,#ccc 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ccc 75%),linear-gradient(-45deg,transparent 75%,#ccc 75%)', backgroundSize: '6px 6px', backgroundPosition: '0 0,0 3px,3px -3px,-3px 0' }
    : { backgroundColor: value };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-[72px] shrink-0">{label}</span>
      <div className="relative h-5 w-5 rounded border border-slate-200 shrink-0 overflow-hidden" style={swatch}>
        <input type="color" value={hex} onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
      </div>
      <input type="text" value={transp ? 'transparent' : hex}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 text-[10px] font-mono bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-300" />
    </div>
  );
}

function SizeInput({ label, value, onChange, min = 0 }: {
  label: string; value: string; onChange: (v: string) => void; min?: number;
}) {
  const num = pxVal(value);
  const display = isNaN(num) || value === 'auto' || value === 'none' ? '' : num;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-[72px] shrink-0">{label}</span>
      <input type="number" value={display} min={min}
        onChange={e => onChange(e.target.value !== '' ? `${e.target.value}px` : '0px')}
        className="flex-1 min-w-0 text-[10px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-300" />
      <span className="text-[10px] text-slate-400 shrink-0 w-5">px</span>
    </div>
  );
}

function SelectInput({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-[72px] shrink-0">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 text-[10px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-300">
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function TextAlignInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: 'left',    label: '≡\u2190' },
    { v: 'center',  label: '≡' },
    { v: 'right',   label: '≡\u2192' },
    { v: 'justify', label: '☰' },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-400 w-[72px] shrink-0">Align</span>
      <div className="flex flex-1 rounded overflow-hidden border border-slate-200">
        {opts.map(o => (
          <button key={o.v} onClick={() => onChange(o.v)}
            className={cn('flex-1 py-0.5 text-[9px] font-mono transition-colors',
              value === o.v ? 'bg-blue-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SpacingGrid({ label, top, right, bottom, left, onChange }: {
  label: string;
  top: string; right: string; bottom: string; left: string;
  onChange: (side: string, v: string) => void;
}) {
  const sides = [
    { key: 'Top',    val: top,    pos: 'col-start-2 row-start-1' },
    { key: 'Right',  val: right,  pos: 'col-start-3 row-start-2' },
    { key: 'Bottom', val: bottom, pos: 'col-start-2 row-start-3' },
    { key: 'Left',   val: left,   pos: 'col-start-1 row-start-2' },
  ];
  return (
    <div>
      <p className="text-[10px] text-slate-400 mb-1.5">{label}</p>
      <div className="grid grid-cols-3 grid-rows-3 gap-1 place-items-center">
        {sides.map(({ key, val, pos }) => (
          <div key={key} className={cn('flex flex-col items-center gap-0.5', pos)}>
            <span className="text-[8px] text-slate-400 uppercase">{key.charAt(0)}</span>
            <input type="number" value={pxVal(val) || ''}
              min={0}
              onChange={e => onChange(key, e.target.value ? `${e.target.value}px` : '0px')}
              className="w-10 text-[10px] text-center bg-slate-50 border border-slate-200 rounded px-0.5 py-0.5 focus:outline-none focus:border-blue-300" />
          </div>
        ))}
        {/* Center label */}
        <div className="col-start-2 row-start-2 text-[8px] text-slate-300 font-semibold uppercase tracking-wide">
          {label.slice(0, 3)}
        </div>
      </div>
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors text-left">
        <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">{title}</span>
        <ChevronDown className={cn('h-2.5 w-2.5 text-slate-300 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

// ─── Viewport config ──────────────────────────────────────────────────────────

const VIEWPORTS = [
  { label: 'Desktop', Icon: Monitor,    width: null  },
  { label: 'Tablet',  Icon: Tablet,     width: 768   },
  { label: 'Mobile',  Icon: Smartphone, width: 390   },
] as const;

type ViewportLabel = (typeof VIEWPORTS)[number]['label'];

// ─── Tag categories ───────────────────────────────────────────────────────────

const TEXT_TAGS = new Set(['p','h1','h2','h3','h4','h5','h6','span','a','label','li','td','th','strong','em','b','i','small','caption','blockquote','code','pre','dt','dd']);
const FLEX_TAGS = new Set(['div','section','article','main','header','footer','nav','aside','form','ul','ol','table','tbody','thead','tr']);

// ─── Scope / type-selector helpers ───────────────────────────────────────────

const TW_PREFIXES = [
  'flex','grid','block','inline','hidden','absolute','relative','fixed','sticky',
  'overflow','truncate','rounded','shadow','ring','opacity','container','bg-','text-',
  'font-','border','p-','px-','py-','pt-','pr-','pb-','pl-','m-','mx-','my-','mt-',
  'mr-','mb-','ml-','w-','h-','min-','max-','gap-','space-','z-','top-','right-',
  'bottom-','left-','inset','items-','justify-','self-','grow','shrink','basis',
  'flex-','col-','row-','cursor-','select-','outline','transition','duration','ease',
  'delay','animate-','scale-','rotate-','translate-','origin-','box-','object-',
  'aspect-','float-','clear-','isolate','blur','brightness','contrast','grayscale',
  'invert','saturate','sepia','backdrop-','table','align-','list-','columns-',
  'indent','underline','overline','line-through','uppercase','lowercase','capitalize',
  'italic','tracking-','leading-','sr-only','fill-','stroke-',
  'sm:','md:','lg:','xl:','2xl:','hover:','focus:','active:','group-','dark:','peer-',
];

function getTypeSelector(el: SelectedElement): string {
  const semantic = el.className.split(/\s+/).filter(c =>
    c.length > 1 && !TW_PREFIXES.some(p => c === p.replace(/-$/, '') || c.startsWith(p))
  );
  return semantic.length > 0 ? `.${semantic[0]}` : el.tagName;
}

function camelToKebab(s: string): string {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function buildTypeCSS(map: Record<string, Record<string, string>>): string {
  return Object.entries(map)
    .filter(([, props]) => Object.keys(props).length > 0)
    .map(([selector, props]) => {
      const body = Object.entries(props)
        .map(([k, v]) => `  ${camelToKebab(k)}: ${v};`)
        .join('\n');
      return `${selector} {\n${body}\n}`;
    })
    .join('\n\n');
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Markdown renderer (simple — reused from AgentsView) ─────────────────────

function MarkdownLogic({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('> ')) {
      elements.push(
        <div key={i} className="bg-blue-50 border-l-2 border-blue-400 rounded-r px-2.5 py-1.5">
          <p className="text-[11px] text-blue-900 leading-snug">{line.slice(2)}</p>
        </div>
      );
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-[10px] font-semibold text-slate-700 mt-3 mb-1 first:mt-0">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-[10px] font-semibold text-slate-600 mt-2 mb-0.5">{line.slice(4)}</h3>);
    } else if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      elements.push(<p key={i} className="text-[10px] font-semibold text-slate-700 mt-1.5">{line.slice(2, -2)}</p>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} className="text-[10px] text-slate-600 ml-3 list-disc leading-snug">{line.slice(2)}</li>);
    } else if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(
        <pre key={i} className="text-[9px] text-emerald-700 bg-slate-50 border border-slate-200 rounded p-1.5 my-1 overflow-x-auto whitespace-pre-wrap font-mono">
          {codeLines.join('\n')}
        </pre>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-0.5" />);
    } else {
      const parts = line.split(/\*\*([^*]+)\*\*/g);
      elements.push(
        <p key={i} className="text-[10px] text-slate-600 leading-snug">
          {parts.map((p, j) => j % 2 === 1 ? <strong key={j} className="text-slate-800 font-semibold">{p}</strong> : p)}
        </p>
      );
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Bubble-style expression renderer ────────────────────────────────────────

const TOKEN_STYLES: Record<ExprToken['kind'], string> = {
  source:    'bg-blue-100 text-blue-800 border border-blue-200',
  property:  'bg-white text-slate-700 border border-slate-200',
  filter:    'bg-amber-50 text-amber-800 border border-amber-200',
  aggregate: 'bg-purple-50 text-purple-800 border border-purple-200',
  value:     'bg-emerald-50 text-emerald-800 border border-emerald-200',
  op:        '',
};

function deriveTokenOptions(stream: string, kind: ExprToken['kind'], allTokens: ExprToken[]): string[] {
  const opts = new Set<string>();
  allTokens.filter(t => t.kind === kind).forEach(t => opts.add(t.label));
  switch (kind) {
    case 'source':
      for (const m of stream.matchAll(/`([^`]{2,50})`/g)) opts.add(m[1]);
      for (const m of stream.matchAll(/\b([A-Z][a-zA-Z]{2,}(?:\s[A-Z][a-zA-Z]{2,})*)\b/g)) opts.add(m[0]);
      break;
    case 'property':
      for (const m of stream.matchAll(/`([^`]{2,50})`/g)) opts.add(m[1]);
      for (const m of stream.matchAll(/\.([a-z][a-zA-Z0-9_]{1,30})\b/g)) opts.add(m[1]);
      for (const m of stream.matchAll(/\b([a-z][a-z0-9]*(?:[A-Z][a-z0-9]+)+)\b/g)) opts.add(m[1]);
      break;
    case 'filter':
      for (const m of stream.matchAll(/(?:where|when|filtered by|only if)\s+([^.,\n]{5,60}?)(?:[.,]|\n|$)/gi)) opts.add(m[1].trim());
      for (const m of stream.matchAll(/`([^`]{2,50})`/g)) opts.add(m[1]);
      break;
    case 'aggregate':
      ['count', 'first item', 'last item', 'sum', 'min', 'max', 'average', 'any item', 'random item', 'is empty', 'is not empty'].forEach(a => opts.add(a));
      break;
    case 'value':
      for (const m of stream.matchAll(/"([^"]{1,40})"/g)) opts.add(m[1]);
      for (const m of stream.matchAll(/'([^']{1,40})'/g)) opts.add(m[1]);
      break;
  }
  return [...opts].filter(s => s.length > 0 && s.length < 60).slice(0, 18);
}

function BubbleExpression({ tokens, logicStream, onTokenEdit }: {
  tokens: ExprToken[];
  logicStream?: string;
  onTokenEdit?: (index: number, newLabel: string) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  function open(i: number) {
    setOpenIndex(i);
    setQuery('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  function close() { setOpenIndex(null); setQuery(''); }

  function select(i: number, value: string) {
    onTokenEdit?.(i, value);
    close();
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-md">
      {tokens.map((t, i) => {
        if (t.kind === 'op') {
          return <span key={i} className="text-[9px] text-slate-400 font-medium px-0.5">{t.label}</span>;
        }
        const isOpen = openIndex === i;
        const options = isOpen ? deriveTokenOptions(logicStream ?? '', t.kind, tokens) : [];
        const filtered = query ? options.filter(o => o.toLowerCase().includes(query.toLowerCase())) : options;
        const showCustom = query.trim() && !filtered.some(o => o.toLowerCase() === query.toLowerCase());
        return (
          <div key={i} className="relative">
            <span
              onClick={() => onTokenEdit && (isOpen ? close() : open(i))}
              className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none shadow-sm ${TOKEN_STYLES[t.kind]} ${onTokenEdit ? 'cursor-pointer hover:brightness-95' : ''} ${isOpen ? 'ring-2 ring-blue-300' : ''}`}
            >
              {t.label}
            </span>
            {isOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={close} />
                <div className="absolute left-0 top-full mt-1 z-50 w-48 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                  <div className="p-1.5 border-b border-slate-100">
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') close();
                        if (e.key === 'Enter' && query.trim()) select(i, query.trim());
                      }}
                      placeholder="Search or type…"
                      className="w-full text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-300"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto py-1">
                    {filtered.map((opt, j) => (
                      <button
                        key={j}
                        onMouseDown={e => { e.preventDefault(); select(i, opt); }}
                        className={`w-full text-left px-2.5 py-1 text-[10px] hover:bg-slate-50 transition-colors ${opt === t.label ? 'font-semibold text-blue-700' : 'text-slate-700'}`}
                      >
                        {opt}
                      </button>
                    ))}
                    {showCustom && (
                      <button
                        onMouseDown={e => { e.preventDefault(); select(i, query.trim()); }}
                        className="w-full text-left px-2.5 py-1 text-[10px] text-slate-500 hover:bg-slate-50 italic"
                      >
                        Use &ldquo;{query.trim()}&rdquo;
                      </button>
                    )}
                    {filtered.length === 0 && !showCustom && (
                      <p className="px-2.5 py-1.5 text-[10px] text-slate-400 italic">No suggestions</p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Strip the <bubble-expr> block from markdown and return it parsed, or null. */
function extractBubbleExpr(text: string): { clean: string; tokens: ExprToken[] | null } {
  const match = text.match(/<bubble-expr>([\s\S]*?)<\/bubble-expr>/);
  if (!match) return { clean: text, tokens: null };
  let tokens: ExprToken[] | null = null;
  try { tokens = JSON.parse(match[1].trim()); } catch { /* ignore */ }
  const clean = text.replace(match[0], '').trim();
  return { clean, tokens };
}

/** Strip the <suggested-tests> block and return parsed array, or null. */
function extractSuggestedTests(text: string): { clean: string; tests: string[] | null } {
  const match = text.match(/<suggested-tests>([\s\S]*?)<\/suggested-tests>/);
  if (!match) return { clean: text, tests: null };
  let tests: string[] | null = null;
  try { tests = JSON.parse(match[1].trim()); } catch { /* ignore */ }
  const clean = text.replace(match[0], '').trim();
  return { clean, tests };
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VisualEditorView() {
  const { directoryPath, addStyleChange } = useGraphStore();
  const { apply: applyChanges, status: applyStatus } = useApplyChanges();
  const iframeRef     = useRef<HTMLIFrameElement>(null);
  const logicRef      = useRef<HTMLDivElement>(null);
  const currentUrlRef = useRef('http://localhost:3001');
  const inspectingRef = useRef(false);
  const [inputUrl, setInputUrl]       = useState('http://localhost:3001');
  const [currentUrl, setCurrentUrl]   = useState('http://localhost:3001');
  const [inspecting, setInspecting]   = useState(false);
  const [selected, setSelected]       = useState<SelectedElement | null>(null);
  const [viewport, setViewport]       = useState<ViewportLabel>('Desktop');
  const [iframeKey, setIframeKey]     = useState(0);
  const [propTab, setPropTab]         = useState<'style' | 'logic'>('style');
  const [styleScope, setStyleScope]   = useState<'element' | 'type'>('element');
  const [typeStylesMap, setTypeStylesMap] = useState<Record<string, Record<string, string>>>({});
  const [logicStream, setLogicStream] = useState('');
  const [logicStatus, setLogicStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [logicSrcFiles, setLogicSrcFiles] = useState<string[]>([]);
  const logicAbortRef = useRef<AbortController | null>(null);
  const [logicIsPrecomputed, setLogicIsPrecomputed] = useState(false);
  const [logicExpr, setLogicExpr] = useState<ExprToken[] | null>(null);
  const [logicSuggestedTests, setLogicSuggestedTests] = useState<string[] | null>(null);
  const [testModal, setTestModal] = useState<{ description: string; index: number } | null>(null);
  const [testCode, setTestCode] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [testFilename, setTestFilename] = useState('');
  const [testWriteStatus, setTestWriteStatus] = useState<'idle' | 'writing' | 'done' | 'error'>('idle');
  const [testCopied, setTestCopied] = useState(false);
  const testAbortRef = useRef<AbortController | null>(null);

  // ── Logic chat state ────────────────────────────────────────────────────────
  const [logicChatInput, setLogicChatInput] = useState('');
  const [logicChatMessages, setLogicChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; isError?: boolean }>>([]);
  const [logicEditStatus, setLogicEditStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [logicEditFile, setLogicEditFile] = useState<string | null>(null);
  const logicEditAbortRef = useRef<AbortController | null>(null);
  const logicChatEndRef = useRef<HTMLDivElement>(null);

  // ── Helper: element-level logic cache (localStorage) ────────────────────────
  function elementCacheKey(el: SelectedElement): string {
    const parts = [
      el.pageUrl ?? '',
      el.tagName,
      el.id ?? '',
      el.className,
      el.reactSource?.fileName ?? '',
    ];
    return `codeviz_elementlogic_v1_${btoa(unescape(encodeURIComponent(parts.join('|'))))}`;
  }

  function getCachedElementLogic(el: SelectedElement): { stream: string; srcFiles: string[]; expr: ExprToken[] | null; tests: string[] | null } | null {
    try {
      const raw = localStorage.getItem(elementCacheKey(el));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function setCachedElementLogic(el: SelectedElement, stream: string, srcFiles: string[], expr: ExprToken[] | null, tests: string[] | null) {
    try {
      localStorage.setItem(elementCacheKey(el), JSON.stringify({ stream, srcFiles, expr, tests }));
    } catch { /* quota exceeded — ignore */ }
  }

  // ── Helper: look up pre-computed page-logic / component-logic cache ──────────
  function getPrecomputedLogic(pageUrl: string, reactSourceFile?: string | null): string | null {
    if (!directoryPath) return null;
    try {
      const raw = localStorage.getItem(`codeviz_pagelogic_v1_${btoa(directoryPath)}`);
      if (!raw) return null;
      const cache = JSON.parse(raw) as Record<string, string>;

      // First: look up by component file path (most specific — instant element-level match)
      if (reactSourceFile) {
        const root = directoryPath.endsWith('/') ? directoryPath : directoryPath + '/';
        const rel = reactSourceFile.startsWith(root)
          ? reactSourceFile.slice(root.length)
          : reactSourceFile.startsWith(directoryPath)
            ? reactSourceFile.slice(directoryPath.length).replace(/^\//, '')
            : reactSourceFile;
        if (cache[rel]) return cache[rel];
      }

      // Fallback: look up by route pathname
      let pathname = '/';
      try { pathname = new URL(pageUrl).pathname; } catch { /* ignore */ }
      const normalized = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
      return cache[normalized] ?? cache[pathname] ?? null;
    } catch { return null; }
  }

  // ── Listen for postMessage from injected inspector ─────────────────────────
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'CVIZ_READY') {
        iframeRef.current?.contentWindow?.postMessage({ type: 'CVIZ_SET_INSPECT', enabled: inspectingRef.current }, '*');
        // Detect full-page navigations (anchor clicks when not in inspect mode):
        // the proxy page sends its window.location.href which is a proxy URL like
        // /api/visual-proxy?url=<targetUrl>. Extract the target and sync the URL bar.
        if (e.data.url) {
          try {
            const proxyParams = new URL(e.data.url);
            const targetUrl = proxyParams.searchParams.get('url');
            if (targetUrl) {
              const norm = (u: string) => u.replace(/\/+$/, '');
              if (norm(targetUrl) !== norm(currentUrlRef.current)) {
                currentUrlRef.current = targetUrl;
                setCurrentUrl(targetUrl);
                setInputUrl(targetUrl);
                setSelected(null);
                setLogicStream('');
                setLogicStatus('idle');
                setLogicSrcFiles([]);
                setLogicIsPrecomputed(false);
              }
            }
          } catch { /* ignore */ }
        }
      }
      if (e.data.type === 'CVIZ_SELECTED')  {
        setSelected(e.data.info as SelectedElement);
        // Reset logic panel for new selection
        setLogicStream('');
        setLogicStatus('idle');
        setLogicSrcFiles([]);
        setLogicIsPrecomputed(false);
        setLogicExpr(null);
        setLogicSuggestedTests(null);
        setLogicChatMessages([]);
        setLogicEditStatus('idle');
        setLogicEditFile(null);
        setLogicChatInput('');
      }
      if (e.data.type === 'CVIZ_DESELECTED') setSelected(null);
      if (e.data.type === 'CVIZ_NAVIGATE') {
        // Client-side navigation (pushState/popstate) inside the iframe.
        // Reload through the proxy so assets and RSC fetches go to the target
        // origin, not the CodeViz server.
        const targetUrl: string = e.data.url;
        if (!targetUrl) return;
        // Deduplicate: ignore if same URL as what's already loaded
        const norm = (u: string) => u.replace(/\/+$/, '');
        if (norm(targetUrl) === norm(currentUrlRef.current)) return;
        currentUrlRef.current = targetUrl;
        setCurrentUrl(targetUrl);
        setInputUrl(targetUrl);
        setSelected(null);
        setLogicStream('');
        setLogicStatus('idle');
        setLogicSrcFiles([]);
        setLogicIsPrecomputed(false);
        setIframeKey(k => k + 1);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // ── Keep currentUrlRef in sync ──────────────────────────────────────────────
  useEffect(() => { currentUrlRef.current = currentUrl; }, [currentUrl]);

  // ── Pre-populate logic as soon as an element is selected ────────────────────
  useEffect(() => {
    if (!selected || !directoryPath) return;
    if (logicStatus === 'loading' || logicStatus === 'done') return;

    fetchLogic(selected);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, directoryPath]);

  // ── Auto-scroll logic panel ─────────────────────────────────────────────────
  useEffect(() => {
    if (logicRef.current) logicRef.current.scrollTop = logicRef.current.scrollHeight;
  }, [logicStream]);

  // ── Auto-scroll logic chat ──────────────────────────────────────────────────
  useEffect(() => {
    logicChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logicChatMessages]);

  // ── Fetch logic from API ────────────────────────────────────────────────────
  async function fetchLogic(el: SelectedElement, force = false) {
    if (!directoryPath) return;

    // Check element-level cache first, then page-level precomputed cache (skip when forcing real-time)
    if (!force) {
      const cached = getCachedElementLogic(el);
      if (cached) {
        logicAbortRef.current?.abort();
        setLogicIsPrecomputed(true);
        setLogicStream(cached.stream);
        setLogicSrcFiles(cached.srcFiles);
        if (cached.expr) setLogicExpr(cached.expr);
        if (cached.tests) setLogicSuggestedTests(cached.tests);
        setLogicStatus('done');
        return;
      }

      const precomputed = getPrecomputedLogic(el.pageUrl ?? '', el.reactSource?.fileName);
      if (precomputed) {
        logicAbortRef.current?.abort();
        setLogicIsPrecomputed(true);
        setLogicStream(precomputed);
        setLogicSrcFiles([]);
        setLogicStatus('done');
        return;
      }
    }

    logicAbortRef.current?.abort();
    const ctrl = new AbortController();
    logicAbortRef.current = ctrl;

    setLogicIsPrecomputed(false);
    setLogicStatus('loading');
    setLogicStream('');
    setLogicSrcFiles([]);

    const params = new URLSearchParams({
      path: directoryPath,
      tagName: el.tagName,
      id: el.id ?? '',
      className: el.className,
      textContent: el.textContent,
      ariaLabel: el.ariaLabel ?? '',
      outerHTML: el.outerHTMLSnippet,
      pageUrl: el.pageUrl ?? '',
      ancestors: JSON.stringify(el.ancestors ?? []),
      reactSource: JSON.stringify(el.reactSource ?? null),
      dataAttrs: JSON.stringify(el.dataAttrs ?? {}),
    });

    try {
      const res = await fetch(`/api/visual-logic?${params}`, { signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.phase === 'token') {
              setLogicStream(p => {
                const updated = p + ev.token;
                const exprMatch = updated.match(/<bubble-expr>([\s\S]*?)<\/bubble-expr>/);
                if (exprMatch) {
                  try { setLogicExpr(JSON.parse(exprMatch[1].trim())); } catch { /* ignore */ }
                }
                const testsMatch = updated.match(/<suggested-tests>([\s\S]*?)<\/suggested-tests>/);
                if (testsMatch) {
                  try { setLogicSuggestedTests(JSON.parse(testsMatch[1].trim())); } catch { /* ignore */ }
                }
                return updated;
              });
            }
            else if (ev.phase === 'scanning' || ev.phase === 'analyzing') {
              setLogicStream(p => p ? p : `_${ev.message}_\n`);
            }
            else if (ev.phase === 'complete') {
              const { clean: clean1, tokens } = extractBubbleExpr(ev.output ?? '');
              const { clean, tests } = extractSuggestedTests(clean1);
              setLogicStream(clean);
              if (tokens) setLogicExpr(tokens);
              if (tests) setLogicSuggestedTests(tests);
              setLogicSrcFiles(ev.sourceFiles ?? []);
              setLogicStatus('done');
              setCachedElementLogic(el, clean, ev.sourceFiles ?? [], tokens ?? null, tests ?? null);
            }
            else if (ev.phase === 'error') {
              setLogicStream(ev.error);
              setLogicStatus('error');
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setLogicStream((err as Error).message ?? 'Failed');
        setLogicStatus('error');
      }
    }
  }

  // ── Send a logic edit instruction ─────────────────────────────────────────
  async function sendLogicEdit(instruction: string) {
    if (!directoryPath || !instruction.trim() || !logicSrcFiles.length) return;

    logicEditAbortRef.current?.abort();
    const ctrl = new AbortController();
    logicEditAbortRef.current = ctrl;

    const elementDesc = selected
      ? `<${selected.tagName}${selected.id ? ` id="${selected.id}"` : ''}${selected.className ? ` class="${selected.className.split(' ').slice(0, 4).join(' ')}"` : ''}>${selected.textContent ? `"${selected.textContent.slice(0, 60)}"` : ''}`
      : '';

    setLogicChatMessages(m => [...m, { role: 'user', content: instruction }]);
    setLogicChatInput('');
    setLogicEditStatus('loading');
    setLogicEditFile(null);

    try {
      const res = await fetch('/api/visual-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directoryPath,
          sourceFiles: logicSrcFiles,
          instruction,
          elementDesc,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let statusMsg = 'Working…';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.phase === 'scanning' || ev.phase === 'generating') {
              statusMsg = ev.message ?? statusMsg;
            } else if (ev.phase === 'complete') {
              setLogicEditFile(ev.file ?? null);
              setLogicChatMessages(m => [...m, { role: 'assistant', content: ev.message ?? `Applied to ${ev.file}` }]);
              setLogicEditStatus('done');
            } else if (ev.phase === 'error') {
              setLogicChatMessages(m => [...m, { role: 'assistant', content: ev.error ?? 'Failed', isError: true }]);
              setLogicEditStatus('error');
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setLogicChatMessages(m => [...m, { role: 'assistant', content: (err as Error).message ?? 'Failed', isError: true }]);
        setLogicEditStatus('error');
      }
    }
  }

  // ── Generate a test for a suggested test description ─────────────────────
  async function generateTest(description: string, index: number) {
    testAbortRef.current?.abort();
    const ctrl = new AbortController();
    testAbortRef.current = ctrl;
    setTestModal({ description, index });
    setTestCode('');
    setTestStatus('loading');
    setTestFilename('');
    setTestWriteStatus('idle');
    setTestCopied(false);

    const params = new URLSearchParams({
      path: directoryPath ?? '',
      description,
      sourceFiles: logicSrcFiles.join(','),
      elementInfo: selected ? `<${selected.tagName}${selected.id ? ` id="${selected.id}"` : ''}${selected.className ? ` class="${selected.className.split(' ').slice(0, 3).join(' ')}"` : ''}>` : '',
    });

    try {
      const res = await fetch(`/api/visual-test?${params}`, { signal: ctrl.signal });
      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.phase === 'token') setTestCode(p => p + ev.token);
              else if (ev.phase === 'complete') {
                setTestCode(ev.output ?? '');
                setTestFilename(ev.suggestedFilename ?? '');
                setTestStatus('done');
              } else if (ev.phase === 'error') {
                setTestCode(ev.error ?? 'Failed');
                setTestStatus('error');
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setTestCode((err as Error).message ?? 'Failed');
        setTestStatus('error');
      }
    }
  }

  async function writeTestFile() {
    if (!directoryPath || !testFilename || !testCode) return;
    setTestWriteStatus('writing');
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directoryPath,
          diffs: [{ file: testFilename, before: '', after: testCode }],
          approvedFiles: [testFilename],
        }),
      });
      const data = await res.json();
      if (data.errors?.length > 0) throw new Error(data.errors[0].error);
      setTestWriteStatus('done');
    } catch {
      setTestWriteStatus('error');
    }
  }

  // ── Toggle inspect mode ────────────────────────────────────────────────────
  function toggleInspect() {
    const next = !inspecting;
    setInspecting(next);
    inspectingRef.current = next;
    iframeRef.current?.contentWindow?.postMessage({ type: 'CVIZ_SET_INSPECT', enabled: next }, '*');
    if (!next) setSelected(null);
  }

  // ── Send accumulated type-rule CSS to iframe ──────────────────────────────
  function sendTypeCSS(map: Record<string, Record<string, string>>) {
    iframeRef.current?.contentWindow?.postMessage({
      type: 'CVIZ_APPLY_STYLE_RULE',
      css: buildTypeCSS(map),
    }, '*');
  }

  // ── Send style update to iframe ────────────────────────────────────────────
  function applyStyle(prop: string, value: string) {
    if (styleScope === 'element' || !selected) {
      iframeRef.current?.contentWindow?.postMessage({ type: 'CVIZ_APPLY_STYLE', prop, value }, '*');
    } else {
      const selector = getTypeSelector(selected);
      const next = {
        ...typeStylesMap,
        [selector]: { ...(typeStylesMap[selector] ?? {}), [prop]: value },
      };
      setTypeStylesMap(next);
      sendTypeCSS(next);
    }
    if (selected) {
      setSelected(s => s ? { ...s, styles: { ...s.styles, [prop]: value } } : s);
      addStyleChange(
        {
          tagName: selected.tagName,
          id: selected.id,
          className: selected.className,
          outerHTMLSnippet: selected.outerHTMLSnippet,
          pageUrl: selected.pageUrl,
          ancestors: selected.ancestors,
          reactSource: selected.reactSource,
        },
        prop,
        value
      );
      applyChanges();
    }
  }

  // ── Navigate ───────────────────────────────────────────────────────────────
  function navigate(url: string) {
    setCurrentUrl(url);
    setInputUrl(url);
    setInspecting(false);
    inspectingRef.current = false;
    setSelected(null);
    setLogicStream('');
    setLogicStatus('idle');
    setLogicSrcFiles([]);
    setLogicIsPrecomputed(false);
    setIframeKey(k => k + 1);
  }

  const proxyUrl  = `/api/visual-proxy?url=${encodeURIComponent(currentUrl)}`;
  const vp        = VIEWPORTS.find(v => v.label === viewport)!;
  const isFlex    = selected?.styles.display === 'flex' || selected?.styles.display === 'grid';
  const isTextEl  = selected ? TEXT_TAGS.has(selected.tagName) : false;

  return (
    <>
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-100">

      {/* ── Top chrome ────────────────────────────────────────────────────── */}
      <div className="h-11 bg-white border-b border-slate-200 flex items-center gap-2 px-3 shrink-0">

        {/* Edit toggle */}
        <button onClick={toggleInspect}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0',
            inspecting
              ? 'bg-blue-500 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}>
          {inspecting
            ? <Crosshair className="h-3.5 w-3.5" />
            : <MousePointer className="h-3.5 w-3.5" />}
          {inspecting ? 'Editing' : 'Edit'}
        </button>

        {/* URL bar */}
        <form className="flex-1 flex items-center gap-1.5 min-w-0"
          onSubmit={e => { e.preventDefault(); navigate(inputUrl); }}>
          <input type="text" value={inputUrl} onChange={e => setInputUrl(e.target.value)}
            className="flex-1 min-w-0 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-300"
            placeholder="http://localhost:3000/page" />
          <button type="submit" title="Navigate"
            className="shrink-0 p-1.5 text-slate-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-slate-100">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </form>

        {/* Viewport switcher */}
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 shrink-0">
          {VIEWPORTS.map(v => (
            <button key={v.label} onClick={() => setViewport(v.label)} title={`${v.label}${v.width ? ` (${v.width}px)` : ''}`}
              className={cn('p-1.5 rounded-md transition-colors',
                viewport === v.label ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600')}>
              <v.Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* iframe */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-4 bg-slate-100">
          <div
            className={cn(
              'bg-white shadow-md rounded-xl overflow-hidden border border-slate-200 transition-all duration-300',
              viewport === 'Desktop' && 'w-full h-full'
            )}
            style={vp.width ? { width: vp.width, minHeight: '100%' } : { width: '100%', height: '100%' }}
          >
            <iframe
              key={iframeKey}
              ref={iframeRef}
              src={proxyUrl}
              className="w-full border-0 block"
              style={{ height: vp.width ? Math.max(600, window?.innerHeight ?? 800) : '100%', minHeight: 400 }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
              onLoad={() => {
                iframeRef.current?.contentWindow?.postMessage(
                  { type: 'CVIZ_SET_INSPECT', enabled: inspectingRef.current }, '*'
                );
                if (Object.keys(typeStylesMap).length > 0) {
                  sendTypeCSS(typeStylesMap);
                }
                // Fallback URL sync: read the nav script's saved initial href
                // (captured before Next.js replaceState runs) directly from the iframe window.
                try {
                  const iwin = iframeRef.current?.contentWindow as (Window & { __cvizInitialHref?: string }) | null;
                  const href = iwin?.__cvizInitialHref ?? iwin?.location.href;
                  if (href) {
                    const parsed = new URL(href);
                    const targetUrl = parsed.searchParams.get('url');
                    if (targetUrl) {
                      const norm = (u: string) => u.replace(/\/+$/, '');
                      if (norm(targetUrl) !== norm(currentUrlRef.current)) {
                        currentUrlRef.current = targetUrl;
                        setCurrentUrl(targetUrl);
                        setInputUrl(targetUrl);
                      }
                    }
                  }
                } catch { /* cross-origin or nav script not yet run */ }
              }}
            />
          </div>
        </div>

        {/* ── Property panel ────────────────────────────────────────────── */}
        <div className="w-64 shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden">

          {selected ? (
            <>
              {/* Element badge */}
              <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50 shrink-0">
                {/* Auto-apply status */}
                {applyStatus !== 'idle' && (
                  <div className={cn(
                    'text-[10px] px-2 py-0.5 rounded-full mb-2 text-center font-medium',
                    applyStatus === 'generating' || applyStatus === 'applying' ? 'bg-amber-50 text-amber-600' :
                    applyStatus === 'success' ? 'bg-green-50 text-green-600' :
                    'bg-red-50 text-red-600'
                  )}>
                    {applyStatus === 'generating' ? '⏳ Generating…' :
                     applyStatus === 'applying' ? '⏳ Applying…' :
                     applyStatus === 'success' ? '✓ Applied' : '✗ Error'}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
                      &lt;{selected.tagName}&gt;
                    </span>
                    {selected.id && (
                      <span className="text-[10px] font-mono text-slate-400 truncate">#{selected.id}</span>
                    )}
                  </div>
                  <button onClick={() => {
                    iframeRef.current?.contentWindow?.postMessage({ type: 'CVIZ_DESELECT' }, '*');
                    setSelected(null);
                  }}
                    className="shrink-0 p-0.5 text-slate-300 hover:text-slate-500 rounded transition-colors">
                    <Minus className="h-3 w-3" />
                  </button>
                </div>
                {selected.className && (
                  <p className="text-[9px] font-mono text-slate-400 mt-1 truncate">
                    .{selected.className.trim().split(/\s+/).join(' .')}
                  </p>
                )}
                {selected.textContent && (
                  <p className="text-[9px] text-slate-400 mt-0.5 italic truncate">&quot;{selected.textContent}&quot;</p>
                )}

                {/* Scope toggle — only shown in Style tab */}
                {propTab === 'style' && (() => {
                  const typeSelector = getTypeSelector(selected);
                  const typeLabel = typeSelector.startsWith('.') ? typeSelector : `<${typeSelector}>`;
                  const hasTypeStyles = Object.keys(typeStylesMap[typeSelector] ?? {}).length > 0;
                  return (
                    <div className="mt-2 flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setStyleScope('element')}
                        className={cn(
                          'flex-1 py-1 text-[9px] rounded-md font-medium transition-colors',
                          styleScope === 'element'
                            ? 'bg-white shadow-sm text-slate-700'
                            : 'text-slate-400 hover:text-slate-600'
                        )}
                      >
                        This element
                      </button>
                      <button
                        onClick={() => setStyleScope('type')}
                        className={cn(
                          'flex-1 py-1 text-[9px] rounded-md font-medium transition-colors flex items-center justify-center gap-1',
                          styleScope === 'type'
                            ? 'bg-white shadow-sm text-slate-700'
                            : 'text-slate-400 hover:text-slate-600'
                        )}
                      >
                        All {typeLabel}
                        {hasTypeStyles && (
                          <span className="w-1 h-1 rounded-full bg-blue-400 shrink-0" />
                        )}
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Tab switcher */}
              <div className="shrink-0 flex border-b border-slate-200 bg-white">
                <button
                  onClick={() => setPropTab('style')}
                  className={cn(
                    'flex-1 py-1.5 text-[10px] font-medium transition-colors',
                    propTab === 'style'
                      ? 'text-blue-600 border-b-2 border-blue-500'
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                >
                  Style
                </button>
                <button
                  onClick={() => {
                    setPropTab('logic');
                    if (logicStatus === 'idle' && selected && directoryPath) {
                      fetchLogic(selected);
                    }
                  }}
                  className={cn(
                    'flex-1 py-1.5 text-[10px] font-medium transition-colors flex items-center justify-center gap-1',
                    propTab === 'logic'
                      ? 'text-blue-600 border-b-2 border-blue-500'
                      : 'text-slate-400 hover:text-slate-600'
                  )}
                >
                  <Cpu className="h-2.5 w-2.5" />
                  Logic
                </button>
              </div>

              {/* Logic fixed header — summary + expression + suggested tests */}
              {propTab === 'logic' && (logicStream || logicExpr || logicSuggestedTests) && (() => {
                const cleaned = logicStream
                  .replace(/<bubble-expr>[\s\S]*?<\/bubble-expr>/g, '')
                  .replace(/<suggested-tests>[\s\S]*?<\/suggested-tests>/g, '')
                  .replace(/<bubble-expr>[\s\S]*$/g, '')
                  .replace(/<suggested-tests>[\s\S]*$/g, '');
                const lines = cleaned.split('\n');
                const splitIdx = lines.findIndex((l, i) => i > 0 && l.trim() !== '' && !l.startsWith('>'));
                const summaryText = splitIdx === -1 ? cleaned : lines.slice(0, splitIdx).join('\n');
                const hasSummary = summaryText.trim().startsWith('>');
                return (
                  <div className="shrink-0 border-b border-slate-100">
                    {hasSummary && (
                      <div className="px-3 pt-4 pb-0 border-b border-slate-100">
                        <MarkdownLogic text={summaryText} />
                        {logicStatus === 'loading' && !logicExpr && (
                          <span className="inline-block w-1 h-3 bg-slate-400 ml-0.5 animate-pulse" />
                        )}
                      </div>
                    )}
                    {logicExpr && logicExpr.length > 0 && (
                      <div className="px-3 py-2.5 border-b border-slate-100">
                        <BubbleExpression
                          tokens={logicExpr}
                          logicStream={logicStream}
                          onTokenEdit={(idx, newLabel) => setLogicExpr(prev => prev ? prev.map((t, i) => i === idx ? { ...t, label: newLabel } : t) : prev)}
                        />
                      </div>
                    )}
                    {logicSuggestedTests && logicSuggestedTests.length > 0 && (
                      <div className="px-3 py-2.5 space-y-1.5">
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Suggested tests</p>
                        {logicSuggestedTests.map((t, i) => (
                          <div key={i} className="flex items-start gap-1.5 group">
                            <span className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-sm bg-slate-100 border border-slate-200 flex items-center justify-center">
                              <svg className="w-2 h-2 text-slate-300" fill="none" viewBox="0 0 8 8"><rect x="1" y="1" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1"/></svg>
                            </span>
                            <p className="text-[10px] text-slate-600 leading-snug flex-1">{t}</p>
                            <button
                              onClick={() => generateTest(t, i)}
                              className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Plus className="h-2.5 w-2.5" />
                              Create
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Type-scope banner */}
              {propTab === 'style' && styleScope === 'type' && selected && (() => {
                const sel = getTypeSelector(selected);
                return (
                  <div className="shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-100 flex items-center gap-1.5">
                    <span className="text-[9px] text-amber-700 font-mono font-semibold">{sel}</span>
                    <span className="text-[9px] text-amber-600">— changes affect all matching elements</span>
                  </div>
                );
              })()}

              {/* Scrollable property sections */}
              <div className={cn('flex-1 overflow-y-auto', propTab !== 'style' && 'hidden')}>

                {/* ── Typography ─────────────────────────────────────── */}
                <Section title="Typography">
                  <ColorInput label="Color" value={selected.styles.color}
                    onChange={v => applyStyle('color', v)} />
                  <SizeInput label="Size" value={selected.styles.fontSize}
                    onChange={v => applyStyle('fontSize', v)} />
                  <SelectInput label="Weight" value={selected.styles.fontWeight}
                    options={['100','200','300','400','500','600','700','800','900']}
                    onChange={v => applyStyle('fontWeight', v)} />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-[72px] shrink-0">Family</span>
                    <input type="text" value={selected.styles.fontFamily}
                      onChange={e => applyStyle('fontFamily', e.target.value)}
                      className="flex-1 min-w-0 text-[10px] bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-300" />
                  </div>
                  <SizeInput label="Line height" value={selected.styles.lineHeight}
                    onChange={v => applyStyle('lineHeight', v)} />
                  {(isTextEl || TEXT_TAGS.has(selected.tagName)) && (
                    <TextAlignInput value={selected.styles.textAlign}
                      onChange={v => applyStyle('textAlign', v)} />
                  )}
                  <SelectInput label="Decoration" value={selected.styles.textDecorationLine}
                    options={['none','underline','overline','line-through']}
                    onChange={v => applyStyle('textDecorationLine', v)} />
                </Section>

                {/* ── Background ─────────────────────────────────────── */}
                <Section title="Background">
                  <ColorInput label="Fill" value={selected.styles.backgroundColor}
                    onChange={v => applyStyle('backgroundColor', v)} />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-[72px] shrink-0">Opacity</span>
                    <input type="range" min={0} max={100}
                      value={Math.round(parseFloat(selected.styles.opacity || '1') * 100)}
                      onChange={e => applyStyle('opacity', String(parseInt(e.target.value) / 100))}
                      className="flex-1" />
                    <span className="text-[10px] text-slate-500 w-7 text-right shrink-0">
                      {Math.round(parseFloat(selected.styles.opacity || '1') * 100)}%
                    </span>
                  </div>
                </Section>

                {/* ── Spacing ────────────────────────────────────────── */}
                <Section title="Spacing">
                  <SpacingGrid label="Padding"
                    top={selected.styles.paddingTop}
                    right={selected.styles.paddingRight}
                    bottom={selected.styles.paddingBottom}
                    left={selected.styles.paddingLeft}
                    onChange={(side, v) => applyStyle(`padding${side}`, v)} />
                  <div className="h-px bg-slate-100 my-1" />
                  <SpacingGrid label="Margin"
                    top={selected.styles.marginTop}
                    right={selected.styles.marginRight}
                    bottom={selected.styles.marginBottom}
                    left={selected.styles.marginLeft}
                    onChange={(side, v) => applyStyle(`margin${side}`, v)} />
                </Section>

                {/* ── Border ─────────────────────────────────────────── */}
                <Section title="Border" defaultOpen={false}>
                  <SizeInput label="Radius" value={selected.styles.borderRadius}
                    onChange={v => applyStyle('borderRadius', v)} />
                  <SizeInput label="Width" value={selected.styles.borderWidth}
                    onChange={v => applyStyle('borderWidth', v)} />
                  <ColorInput label="Color" value={selected.styles.borderColor}
                    onChange={v => applyStyle('borderColor', v)} />
                  <SelectInput label="Style" value={selected.styles.borderStyle}
                    options={['none','solid','dashed','dotted','double','groove','ridge']}
                    onChange={v => applyStyle('borderStyle', v)} />
                </Section>

                {/* ── Layout ─────────────────────────────────────────── */}
                {(FLEX_TAGS.has(selected.tagName) || isFlex) && (
                  <Section title="Layout" defaultOpen={false}>
                    <SelectInput label="Display" value={selected.styles.display}
                      options={['block','inline-block','inline','flex','grid','none']}
                      onChange={v => applyStyle('display', v)} />
                    {isFlex && (
                      <>
                        <SelectInput label="Direction" value={selected.styles.flexDirection}
                          options={['row','row-reverse','column','column-reverse']}
                          onChange={v => applyStyle('flexDirection', v)} />
                        <SizeInput label="Gap" value={selected.styles.gap}
                          onChange={v => applyStyle('gap', v)} />
                        <SelectInput label="Align" value={selected.styles.alignItems}
                          options={['stretch','flex-start','flex-end','center','baseline']}
                          onChange={v => applyStyle('alignItems', v)} />
                        <SelectInput label="Justify" value={selected.styles.justifyContent}
                          options={['flex-start','flex-end','center','space-between','space-around','space-evenly']}
                          onChange={v => applyStyle('justifyContent', v)} />
                      </>
                    )}
                  </Section>
                )}

                {/* ── Size ───────────────────────────────────────────── */}
                <Section title="Size" defaultOpen={false}>
                  <SizeInput label="Width" value={selected.styles.width}
                    onChange={v => applyStyle('width', v)} />
                  <SizeInput label="Height" value={selected.styles.height}
                    onChange={v => applyStyle('height', v)} />
                </Section>

                {/* ── Shadow ─────────────────────────────────────────── */}
                <Section title="Shadow" defaultOpen={false}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 w-[72px] shrink-0">Box shadow</span>
                    <input type="text" value={selected.styles.boxShadow}
                      onChange={e => applyStyle('boxShadow', e.target.value)}
                      className="flex-1 min-w-0 text-[10px] font-mono bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-300"
                      placeholder="none" />
                  </div>
                </Section>

              </div>

              {/* ── Logic panel ──────────────────────────────────────── */}
              <div className={cn('flex-1 flex flex-col overflow-hidden', propTab !== 'logic' && 'hidden')}>
                {/* Scrollable analysis content */}
                <div ref={logicRef} className="flex-1 overflow-y-auto">
                  {logicStatus === 'idle' && (
                    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                      <Cpu className="h-8 w-8 text-slate-200 mb-3" />
                      <p className="text-[10px] text-slate-400">Logic analysis will appear here</p>
                    </div>
                  )}

                  {logicStatus === 'loading' && logicStream === '' && (
                    <div className="flex items-center justify-center p-6">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    </div>
                  )}

                  {(logicStatus === 'loading' || logicStatus === 'done') && logicStream && (() => {
                    const cleaned = logicStream
                      .replace(/<bubble-expr>[\s\S]*?<\/bubble-expr>/g, '')
                      .replace(/<suggested-tests>[\s\S]*?<\/suggested-tests>/g, '')
                      .replace(/<bubble-expr>[\s\S]*$/g, '')
                      .replace(/<suggested-tests>[\s\S]*$/g, '');
                    const lines = cleaned.split('\n');
                    const splitIdx = lines.findIndex((l, i) => i > 0 && l.trim() !== '' && !l.startsWith('>'));
                    const bodyText = splitIdx === -1 ? '' : lines.slice(splitIdx).join('\n');
                    if (!bodyText) return logicStatus === 'loading' ? (
                      <div className="p-3">
                        <span className="inline-block w-1 h-3 bg-slate-400 ml-0.5 animate-pulse" />
                      </div>
                    ) : null;
                    return (
                      <div className="p-3 space-y-2">
                        <MarkdownLogic text={bodyText} />
                        {logicStatus === 'loading' && (
                          <span className="inline-block w-1 h-3 bg-slate-400 ml-0.5 animate-pulse" />
                        )}
                      </div>
                    );
                  })()}

                  {logicStatus === 'done' && logicSrcFiles.length > 0 && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-100 mt-2">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Source files</p>
                      {logicSrcFiles.map(f => (
                        <p key={f} className="text-[9px] font-mono text-slate-400 truncate">{f}</p>
                      ))}
                    </div>
                  )}

                  {logicStatus === 'error' && (
                    <div className="p-3">
                      <p className="text-[10px] text-red-500 mb-2">{logicStream}</p>
                      <button
                        onClick={() => { setLogicStatus('idle'); if (selected) fetchLogic(selected); }}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        Retry
                      </button>
                    </div>
                  )}

                  {logicStatus === 'done' && (
                    <div className="px-3 pb-3 border-t border-slate-100 mt-1 pt-2 space-y-1.5">
                      {logicIsPrecomputed && (
                        <p className="text-[9px] text-slate-400 flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                          Page-level analysis (pre-computed)
                        </p>
                      )}
                      <button
                        onClick={() => { setLogicStatus('idle'); setLogicStream(''); if (selected) fetchLogic(selected, true); }}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        {logicIsPrecomputed ? 'Analyze this element' : 'Re-analyze'}
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Logic chatbox ─────────────────────────────────── */}
                {logicSrcFiles.length > 0 && (
                  <div className="shrink-0 border-t border-slate-200 flex flex-col">
                    {/* Chat message history */}
                    {logicChatMessages.length > 0 && (
                      <div className="max-h-40 overflow-y-auto px-2 py-2 space-y-1.5 bg-slate-50">
                        {logicChatMessages.map((msg, i) => (
                          <div key={i} className={cn(
                            'text-[10px] leading-snug rounded px-2 py-1.5',
                            msg.role === 'user'
                              ? 'bg-blue-50 text-blue-800 border border-blue-100 self-end ml-4'
                              : msg.isError
                                ? 'bg-red-50 text-red-700 border border-red-100'
                                : 'bg-white text-slate-700 border border-slate-200'
                          )}>
                            {msg.role === 'assistant' && !msg.isError && (
                              <span className="inline-flex items-center gap-1 text-green-600 font-medium mb-0.5 block">
                                <Check className="h-2.5 w-2.5" />
                                {msg.content}
                              </span>
                            )}
                            {(msg.role === 'user' || msg.isError) && msg.content}
                          </div>
                        ))}
                        {/* Refresh button after successful edit */}
                        {logicEditStatus === 'done' && logicEditFile && (
                          <button
                            onClick={() => setIframeKey(k => k + 1)}
                            className="flex items-center gap-1 text-[9px] text-slate-400 hover:text-slate-600 px-2 py-1"
                          >
                            <RefreshCcw className="h-2.5 w-2.5" />
                            Refresh preview
                          </button>
                        )}
                        <div ref={logicChatEndRef} />
                      </div>
                    )}

                    {/* Loading indicator */}
                    {logicEditStatus === 'loading' && (
                      <div className="px-3 py-1.5 flex items-center gap-1.5 bg-slate-50 border-t border-slate-100">
                        <Loader2 className="h-3 w-3 animate-spin text-blue-400 shrink-0" />
                        <span className="text-[10px] text-slate-500">Applying change…</span>
                      </div>
                    )}

                    {/* Input row */}
                    <div className="flex items-end gap-1.5 px-2 py-2">
                      <textarea
                        value={logicChatInput}
                        onChange={e => setLogicChatInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (logicChatInput.trim() && logicEditStatus !== 'loading') {
                              sendLogicEdit(logicChatInput.trim());
                            }
                          }
                        }}
                        placeholder="Describe a change…"
                        rows={2}
                        className="flex-1 min-w-0 text-[10px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-blue-300 leading-snug placeholder:text-slate-300"
                      />
                      <button
                        onClick={() => {
                          if (logicChatInput.trim() && logicEditStatus !== 'loading') {
                            sendLogicEdit(logicChatInput.trim());
                          }
                        }}
                        disabled={!logicChatInput.trim() || logicEditStatus === 'loading'}
                        className={cn(
                          'shrink-0 p-1.5 rounded-lg transition-colors',
                          logicChatInput.trim() && logicEditStatus !== 'loading'
                            ? 'bg-blue-500 text-white hover:bg-blue-600'
                            : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                        )}
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className={cn(
                'h-12 w-12 rounded-full flex items-center justify-center mb-4 transition-colors',
                inspecting ? 'bg-blue-50' : 'bg-slate-50'
              )}>
                {inspecting
                  ? <Crosshair className="h-6 w-6 text-blue-400" />
                  : <MousePointer className="h-6 w-6 text-slate-300" />
                }
              </div>
              <p className="text-xs font-medium text-slate-600 mb-1">
                {inspecting ? 'Click any element' : 'Enable Edit'}
              </p>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                {inspecting
                  ? 'Hover to highlight, click to select and edit properties'
                  : 'Activate inspect mode to select and edit elements visually'
                }
              </p>
              {!inspecting && (
                <button onClick={toggleInspect}
                  className="mt-4 px-4 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-colors font-medium">
                  Enable Edit
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Test generation modal ─────────────────────────────────────────── */}
    <Dialog open={testModal !== null} onOpenChange={open => { if (!open) { testAbortRef.current?.abort(); setTestModal(null); } }}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-slate-800 pr-6">
            {testModal?.description}
          </DialogTitle>
        </DialogHeader>

        {/* Code area */}
        <div className="relative rounded-lg bg-slate-900 overflow-hidden">
          <div className="overflow-y-auto max-h-[50vh] p-4">
            {testStatus === 'loading' && testCode === '' ? (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Generating test…</span>
              </div>
            ) : (
              <pre className="text-[11px] text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                {testCode}
                {testStatus === 'loading' && (
                  <span className="inline-block w-1 h-3 bg-slate-400 ml-0.5 animate-pulse" />
                )}
              </pre>
            )}
          </div>

          {testCode && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(testCode);
                setTestCopied(true);
                setTimeout(() => setTestCopied(false), 2000);
              }}
              className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              {testCopied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
              {testCopied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>

        {testStatus === 'done' && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-mono text-slate-400 truncate">{testFilename}</span>
            <button
              onClick={writeTestFile}
              disabled={testWriteStatus === 'writing' || testWriteStatus === 'done'}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors shrink-0',
                testWriteStatus === 'done'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : testWriteStatus === 'error'
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              )}
            >
              {testWriteStatus === 'writing' ? (
                <><Loader2 className="h-3 w-3 animate-spin" /> Writing…</>
              ) : testWriteStatus === 'done' ? (
                <><Check className="h-3 w-3" /> Written</>
              ) : testWriteStatus === 'error' ? (
                'Write failed'
              ) : (
                <><FileCode className="h-3 w-3" /> Write to file</>
              )}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
