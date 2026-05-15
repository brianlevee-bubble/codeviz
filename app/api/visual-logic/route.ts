export const runtime = 'nodejs';

import path from 'path';
import { readFile, access, readdir } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);
const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

interface AncestorInfo {
  tagName: string;
  id: string | null;
  className: string;
  ariaLabel: string | null;
  role: string | null;
  dataAttrs: Record<string, string>;
}

// ── Tailwind utility detector ─────────────────────────────────────────────────
const TW_PREFIXES = [
  'flex','grid','block','inline','hidden','absolute','relative','fixed','sticky',
  'overflow','truncate','whitespace','rounded','shadow','ring','opacity','container',
  'bg-','text-','font-','border','p-','px-','py-','pt-','pr-','pb-','pl-',
  'm-','mx-','my-','mt-','mr-','mb-','ml-','w-','h-','min-','max-','gap-',
  'space-','z-','top-','right-','bottom-','left-','inset','items-','justify-',
  'self-','grow','shrink','basis','flex-','col-','row-','cursor-','select-',
  'outline','transition','duration','ease','delay','animate-','scale-','rotate-',
  'translate-','origin-','box-','object-','aspect-','float-','clear-','isolate',
  'blur','brightness','contrast','grayscale','invert','saturate','sepia',
  'backdrop-','table','align-','list-','columns-','indent','underline',
  'overline','line-through','uppercase','lowercase','capitalize','italic',
  'tracking-','leading-','sr-only','fill-','stroke-',
  'sm:','md:','lg:','xl:','2xl:','hover:','focus:','active:','group-','dark:','peer-',
];

function semanticClasses(className: string): string[] {
  return className.split(/\s+/).filter(c =>
    c.length > 1 && !TW_PREFIXES.some(p => c === p.replace(/-$/, '') || c.startsWith(p) || c.includes(':' + p))
  );
}

// ── Walk app/ dir to find the best-matching page file for a pathname ──────────
// Handles dynamic segments like [id], [userId], [slug], (route-groups), etc.
async function findPageFileByWalk(
  pathname: string,
  projectRoot: string
): Promise<string | null> {
  const segments = pathname.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean);

  async function walk(dir: string, segIdx: number): Promise<string | null> {
    let entries: { name: string; isDirectory: () => boolean }[];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }

    if (segIdx === segments.length) {
      // Reached the end of the path — look for a page file here
      for (const ext of ['page.tsx', 'page.ts', 'page.jsx', 'page.js']) {
        if (entries.some(e => !e.isDirectory() && e.name === ext)) {
          return path.relative(projectRoot, path.join(dir, ext));
        }
      }
      return null;
    }

    const seg = segments[segIdx];
    const exactMatch = entries.find(e => e.isDirectory() && e.name === seg);
    if (exactMatch) {
      const found = await walk(path.join(dir, exactMatch.name), segIdx + 1);
      if (found) return found;
    }

    // Try dynamic segment dirs ([id], [slug], [userId], etc.) and route groups ((group))
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === exactMatch?.name) continue; // already tried
      const isDynamic = entry.name.startsWith('[') && entry.name.endsWith(']');
      const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')');
      if (isDynamic) {
        const found = await walk(path.join(dir, entry.name), segIdx + 1);
        if (found) return found;
      } else if (isGroup) {
        // Route groups don't consume a segment
        const found = await walk(path.join(dir, entry.name), segIdx);
        if (found) return found;
      }
    }

    return null;
  }

  // Try app router (both root-level and src/)
  for (const appBase of ['app', 'src/app']) {
    const appDir = path.join(projectRoot, appBase);
    const appResult = await walk(appDir, 0);
    if (appResult) return appResult;
  }

  // Try pages router (root-level and src/)
  async function walkPages(dir: string, segIdx: number): Promise<string | null> {
    let entries: { name: string; isDirectory: () => boolean }[];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }

    if (segIdx === segments.length) {
      for (const name of ['index.tsx', 'index.ts', 'index.jsx', 'index.js']) {
        if (entries.some(e => !e.isDirectory() && e.name === name)) {
          return path.relative(projectRoot, path.join(dir, name));
        }
      }
      return null;
    }

    const seg = segments[segIdx];
    // Exact file match at this level
    for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
      const fileName = seg + ext;
      if (entries.some(e => !e.isDirectory() && e.name === fileName)) {
        if (segIdx === segments.length - 1) {
          return path.relative(projectRoot, path.join(dir, fileName));
        }
      }
    }
    // Directory match
    const exactDir = entries.find(e => e.isDirectory() && e.name === seg);
    if (exactDir) {
      const found = await walkPages(path.join(dir, exactDir.name), segIdx + 1);
      if (found) return found;
    }
    // Dynamic segment
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('[') && entry.name.endsWith(']')) {
        const found = await walkPages(path.join(dir, entry.name), segIdx + 1);
        if (found) return found;
      }
    }
    return null;
  }

  // Try pages router (both root-level and src/)
  for (const pagesBase of ['pages', 'src/pages']) {
    const pd = path.join(projectRoot, pagesBase);
    const result = await walkPages(pd, 0);
    if (result) return result;
  }

  return null;
}

// ── Check if a file exists ────────────────────────────────────────────────────
async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

// ── Grep for a term in the project ───────────────────────────────────────────
async function grepFiles(term: string, cwd: string): Promise<string[]> {
  if (!term.trim() || term.length < 2) return [];
  try {
    const escaped = term.replace(/['"\\]/g, '\\$&');
    const { stdout } = await execAsync(
      `grep -rl --include="*.tsx" --include="*.ts" --include="*.jsx" --include="*.js" "${escaped}" . 2>/dev/null | grep -v node_modules | grep -v .next | grep -v .test. | grep -v .spec. | head -8`,
      { cwd, timeout: 2000 }
    );
    return stdout.trim().split('\n').filter(Boolean).map(p => p.replace(/^\.\//, ''));
  } catch { return []; }
}

// ── Grep for multiple terms in parallel and merge results ─────────────────────
async function grepFilesParallel(terms: string[], cwd: string, maxFiles = 10): Promise<Map<string, 'grep'>> {
  const results = await Promise.all(terms.map(t => grepFiles(t, cwd)));
  const fileSet = new Map<string, 'grep'>();
  for (const files of results) {
    for (const f of files) {
      if (!fileSet.has(f)) fileSet.set(f, 'grep');
      if (fileSet.size >= maxFiles) return fileSet;
    }
  }
  return fileSet;
}

// ── Read a file safely ────────────────────────────────────────────────────────
async function tryRead(filePath: string): Promise<string | null> {
  try { return await readFile(filePath, 'utf-8'); } catch { return null; }
}

// ── Build search terms from element + ancestors ───────────────────────────────
function buildSearchTerms(params: {
  tagName: string; id: string; className: string;
  textContent: string; ariaLabel: string; ancestors: AncestorInfo[];
  dataAttrs?: Record<string, string>;
}): Array<{ term: string; reason: string }> {
  const terms: Array<{ term: string; reason: string }> = [];
  const seen = new Set<string>();
  function add(term: string, reason: string) {
    if (term && !seen.has(term)) { seen.add(term); terms.push({ term, reason }); }
  }

  // Self
  if (params.id) add(params.id, `id="${params.id}"`);
  for (const c of semanticClasses(params.className).slice(0, 3))
    add(c, `class="${c}"`);
  if (params.ariaLabel) add(params.ariaLabel, 'aria-label');
  // data attributes on the element itself
  for (const [k, v] of Object.entries(params.dataAttrs ?? {}))
    add(v, `${k}="${v}"`);

  // Walk ancestors — each level
  for (const anc of params.ancestors) {
    if (anc.id) add(anc.id, `ancestor id="${anc.id}"`);
    for (const c of semanticClasses(anc.className).slice(0, 2))
      add(c, `ancestor class="${c}"`);
    if (anc.ariaLabel) add(anc.ariaLabel, `ancestor aria-label`);
    // data attributes on ancestor
    for (const [k, v] of Object.entries(anc.dataAttrs ?? {}))
      add(v, `ancestor ${k}="${v}"`);
  }

  // Text content (words >= 2 chars — catches short labels like "Add", "No", "Go")
  for (const word of params.textContent.split(/\s+/).filter(w => w.length >= 2).slice(0, 4))
    add(word, 'text content');

  return terms;
}

// ── Extract local imports from a file's content ───────────────────────────────
function extractLocalImports(content: string, fileDir: string, projectRoot: string): string[] {
  const results: string[] = [];
  // Match: import ... from './foo' or '../bar' or '@/baz'
  const importRe = /from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(content)) !== null) {
    const spec = m[1];
    let absBase: string;
    if (spec.startsWith('.')) {
      absBase = path.join(fileDir, spec);
    } else if (spec.startsWith('@/')) {
      absBase = path.join(projectRoot, spec.replace(/^@\//, ''));
    } else {
      continue; // third-party package
    }
    // Try common extensions
    for (const ext of ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']) {
      const absCandidate = absBase + ext;
      const relative = path.relative(projectRoot, absCandidate);
      if (!relative.startsWith('..')) {
        results.push(relative);
        break;
      }
    }
  }
  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath   = searchParams.get('path');
  const tagName   = searchParams.get('tagName') ?? '';
  const elId      = searchParams.get('id') ?? '';
  const className = searchParams.get('className') ?? '';
  const textContent = searchParams.get('textContent') ?? '';
  const ariaLabel = searchParams.get('ariaLabel') ?? '';
  const outerHTML = searchParams.get('outerHTML') ?? '';
  const pageUrl   = searchParams.get('pageUrl') ?? '';
  let ancestors: AncestorInfo[] = [];
  try { ancestors = JSON.parse(searchParams.get('ancestors') ?? '[]'); } catch { /* ignore */ }
  let reactSource: { fileName: string; lineNumber: number | null; componentName: string | null } | null = null;
  try { reactSource = JSON.parse(searchParams.get('reactSource') ?? 'null'); } catch { /* ignore */ }
  let elDataAttrs: Record<string, string> = {};
  try { elDataAttrs = JSON.parse(searchParams.get('dataAttrs') ?? '{}'); } catch { /* ignore */ }

  if (!dirPath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);

  // pageUrl may be the proxy URL (e.g. /api/visual-proxy?url=http://localhost:3000/foo).
  // Unwrap the real target URL so urlToPagePaths maps to the correct page file.
  let effectivePageUrl = pageUrl;
  try {
    const parsed = new URL(pageUrl);
    if (parsed.pathname.includes('/visual-proxy')) {
      effectivePageUrl = parsed.searchParams.get('url') ?? pageUrl;
    }
  } catch { /* use pageUrl as-is */ }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'scanning', message: 'Finding source files…' });

const fileSet = new Map<string, 'page' | 'grep' | 'fiber'>(); // path → how it was found

        // ── Strategy 0: React fiber _debugSource (highest confidence) ──────────
        if (reactSource?.fileName) {
          // fileName is an absolute path from the dev server (e.g. /Users/…/app/foo/page.tsx)
          // Make it relative to the project root
          let rel = reactSource.fileName;
          if (path.isAbsolute(rel)) {
            rel = path.relative(resolved, rel);
          }
          if (!rel.startsWith('..') && await exists(path.resolve(resolved, rel))) {
            fileSet.set(rel, 'fiber');
          }
        }

        // ── Strategy 1: filesystem walk to find matching page file ───────────────
        let pageFilePath: string | null = null;
        if (effectivePageUrl) {
          let pathname = '/';
          try { pathname = new URL(effectivePageUrl).pathname; } catch { /* ignore */ }
          const found = await findPageFileByWalk(pathname, resolved);
          if (found) {
            fileSet.set(found, 'page');
            pageFilePath = found;
          }
        }

        // ── Strategy 2: Grep for element + ancestor identifiers (parallel) ────
        const searchTerms = buildSearchTerms({ tagName, id: elId, className, textContent, ariaLabel, ancestors, dataAttrs: elDataAttrs });
        if (searchTerms.length > 0) {
          const grepResults = await grepFilesParallel(searchTerms.slice(0, 8).map(t => t.term), resolved);
          for (const [f, v] of grepResults) {
            if (!fileSet.has(f)) fileSet.set(f, v);
          }
        }

        // ── Strategy 3: follow imports from page file (2 levels deep) ────────
        if (pageFilePath) {
          const pageContent = await tryRead(path.resolve(resolved, pageFilePath));
          if (pageContent) {
            const pageDir = path.dirname(path.resolve(resolved, pageFilePath));
            const level1 = extractLocalImports(pageContent, pageDir, resolved);
            // Check all level-1 imports in parallel
            const level1Checks = await Promise.all(
              level1.slice(0, 8).map(async imp => ({ imp, ok: !fileSet.has(imp) && await exists(path.resolve(resolved, imp)) }))
            );
            const added: string[] = [];
            for (const { imp, ok } of level1Checks) {
              if (ok) { fileSet.set(imp, 'grep'); added.push(imp); }
            }
            // Level 2: read imports of imports in parallel
            const level2Contents = await Promise.all(added.slice(0, 4).map(imp => tryRead(path.resolve(resolved, imp))));
            for (let i = 0; i < added.slice(0, 4).length; i++) {
              const impContent = level2Contents[i];
              if (!impContent) continue;
              const impDir = path.dirname(path.resolve(resolved, added[i]));
              const level2 = extractLocalImports(impContent, impDir, resolved);
              const l2checks = await Promise.all(
                level2.slice(0, 6).map(async imp2 => ({ imp2, ok: !fileSet.has(imp2) && fileSet.size < 12 && await exists(path.resolve(resolved, imp2)) }))
              );
              for (const { imp2, ok } of l2checks) {
                if (ok) fileSet.set(imp2, 'grep');
              }
            }
          }
        }

        // ── Strategy 4: URL path as grep fallback ─────────────────────────────
        if (fileSet.size === 0) {
          let urlPath = '/';
          try { urlPath = new URL(effectivePageUrl).pathname; } catch { /* ignore */ }
          if (urlPath !== '/') {
            const segment = urlPath.split('/').filter(Boolean).pop() ?? '';
            if (segment.length > 2) {
              const found = await grepFiles(segment, resolved);
              for (const f of found) fileSet.set(f, 'grep');
            }
          }
        }

        // ── Strategy 5: text content fallback ────────────────────────────────
        if (fileSet.size === 0 && textContent.length >= 2) {
          const found = await grepFiles(textContent.slice(0, 20), resolved);
          for (const f of found) fileSet.set(f, 'grep');
        }

        // ── Strategy 6: scan common component directories as last resort ──────
        if (fileSet.size === 0) {
          for (const compBase of ['components', 'src/components', 'app/components']) {
            const compDir = path.join(resolved, compBase);
            try {
              const entries = await readdir(compDir, { withFileTypes: true });
              for (const e of entries) {
                if (!e.isDirectory() && /\.(tsx|ts|jsx|js)$/.test(e.name) && fileSet.size < 8) {
                  const rel = path.relative(resolved, path.join(compDir, e.name));
                  fileSet.set(rel, 'grep');
                }
              }
              if (fileSet.size > 0) break;
            } catch { /* dir doesn't exist */ }
          }
        }

        const candidates = [...fileSet.keys()].slice(0, 6);

        if (candidates.length === 0) {
          emit({
            phase: 'complete',
            output: `## No source files found\n\nCouldn't locate source files for this element.\n\n**Tips:**\n- Select a parent container element instead\n- Elements with an \`id\` or custom class name are easiest to trace\n- Make sure the project path is set correctly`,
          });
          controller.close();
          return;
        }

        emit({ phase: 'scanning', message: `Reading ${candidates.length} file${candidates.length === 1 ? '' : 's'}…` });

        // Read files — fiber/page files get priority (included fully), grep files get truncated
        const fileContents: Array<{ file: string; content: string; isPrimary: boolean }> = [];
        for (const f of candidates) {
          const isPrimary = fileSet.get(f) === 'page' || fileSet.get(f) === 'fiber';
          const content = await tryRead(path.resolve(resolved, f));
          if (content) {
            fileContents.push({ file: f, content: content.slice(0, isPrimary ? 10000 : 6000), isPrimary });
          }
        }

        // Sort: page files first
        fileContents.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));

        emit({ phase: 'analyzing', message: 'Analyzing logic…' });

        // Build element description including ancestors
        const ancestorChain = ancestors.slice(0, 5).map(a => {
          const parts = [`<${a.tagName}`];
          if (a.id) parts.push(` id="${a.id}"`);
          const sem = semanticClasses(a.className).slice(0, 3);
          if (sem.length) parts.push(` class="${sem.join(' ')}"`);
          if (a.ariaLabel) parts.push(` aria-label="${a.ariaLabel}"`);
          parts.push('>');
          return parts.join('');
        });

        const elementDesc = [
          ancestorChain.length ? ancestorChain.reverse().join('\n  ') + '\n    ' : '',
          `<${tagName}`,
          elId ? ` id="${elId}"` : '',
          semanticClasses(className).length ? ` class="${semanticClasses(className).join(' ')}"` : '',
          ariaLabel ? ` aria-label="${ariaLabel}"` : '',
          `>${textContent ? ` "${textContent.slice(0, 60)}"` : ''}`,
        ].join('');

        const fiberHint = reactSource?.fileName && reactSource.lineNumber
          ? `\nReact component: ${reactSource.componentName ?? 'unknown'} at line ${reactSource.lineNumber}`
          : '';

        const filesBlock = fileContents
          .map(({ file, content, isPrimary }) =>
            `### ${file}${isPrimary ? ' (component source)' : ''}\n\`\`\`tsx\n${content}\n\`\`\``
          ).join('\n\n');

        const systemPrompt = `You are a React/Next.js expert. Explain what logic determines what a selected DOM element displays and does.

Start your response with a single blockquote summary (using > at the start of the line): one or two plain-English sentences that say what this element is and what drives its content — written for a developer who hasn't read the code. No jargon, no variable names in the summary. Example: "> This is a list of recent orders fetched from the API. It shows a loading skeleton while data is loading and an empty state if the user has no orders."

Immediately after the summary, output a Bubble-style expression. The format depends on the element type:

FOR DISPLAY ELEMENTS (showing data): express what value is being displayed.
FOR SUBMIT/ACTION ELEMENTS (button, form submit, onClick with mutation): express what data is being sent and where.

Format as a single line of JSON inside exactly these tags:
<bubble-expr>[{"kind":"source","label":"..."},{"kind":"op","label":"'s"},{"kind":"property","label":"..."}]</bubble-expr>

Token kind values:
- "source" — data origin (e.g. "Current User", "Search for Orders", "URL parameter")
- "property" — a field name or form field being sent (e.g. "email", "name", "password")
- "filter" — a condition (e.g. "status = active")
- "aggregate" — a computation (e.g. "count", "first item")
- "op" — plain connector text between pills: "'s", "where", "+", "→", "to"
- "value" — endpoint, action, or literal (e.g. "POST /api/login", "true", "navigate /dashboard")

For submit/action elements, use this pattern — list each field as a "property" pill, then "→" op, then the endpoint/action as a "value" pill:
Example login button: [{"kind":"property","label":"email"},{"kind":"op","label":"+"},{"kind":"property","label":"password"},{"kind":"op","label":"→"},{"kind":"value","label":"POST /api/auth/login"}]
Example nav button: [{"kind":"op","label":"navigate to"},{"kind":"value","label":"/dashboard"}]

Rules: keep it 3–8 tokens. If the element is truly static or the expression is unknowable, omit the <bubble-expr> block entirely.

Immediately after the bubble-expr, output 2–4 short test descriptions that could be written to verify this element's behavior. Each should be a plain-English sentence describing a specific, runnable test case (e.g. "Shows a loading skeleton while data is being fetched", "Renders an empty state message when the list has no items"). Focus on the actual behavior and logic you found — not generic tests. Format as a JSON array inside exactly these tags:
<suggested-tests>["test description 1","test description 2"]</suggested-tests>

Then add detail sections only where relevant — skip sections that don't apply:
## Data — What is fetched or queried? (useQuery, fetch, useSWR, Prisma, API calls, props)
## Conditions — What controls if/what this element shows? (ternaries, &&, .filter(), permission checks)
## State — What state drives the content? (useState, context, URL params, store)
## Iteration — If it's a list item, what drives the list? (.map(), the data source, empty state)
## On Click — If the element has an onClick, onSubmit, or any interactive handler: what happens? (navigation, mutation, modal open, state change, API call). Only include this section if there is actually a click/interaction handler.

Be specific in the detail sections — use actual variable/function names from the code.
If you can't find the exact render logic, say what you found and why the match might be indirect.

Return the summary + bubble-expr + suggested-tests + detail markdown sections.`;

        const userMsg = `Selected element (with ancestor context):
\`\`\`html
${elementDesc}
\`\`\`
${fiberHint}
Outer HTML snippet:
\`\`\`html
${outerHTML.slice(0, 300)}
\`\`\`

Source files:
${filesBlock}`;

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        emit({ phase: 'complete', output: fullText.trim(), sourceFiles: candidates });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
