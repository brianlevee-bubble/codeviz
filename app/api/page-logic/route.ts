export const runtime = 'nodejs';

import path from 'path';
import { readFile, access, readdir } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── Find all page files in app/ and pages/ directories ───────────────────────

interface PageEntry { route: string; file: string; }

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function walkAppDir(dir: string, dirPath: string, routePrefix: string, results: PageEntry[]) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      // Skip API routes, private dirs, special dirs
      if (name === 'api' || name.startsWith('_') || name === 'node_modules' || name === '.next') continue;
      // Strip route group syntax (parentheses) — e.g. (auth) — keep the actual route unchanged
      const routeSegment = name.startsWith('(') && name.endsWith(')') ? '' : `/${name}`;
      const fullPath = path.join(dir, name);
      if (entry.isDirectory()) {
        await walkAppDir(fullPath, dirPath, `${routePrefix}${routeSegment}`, results);
      } else if (/^page\.(tsx|ts|jsx|js)$/.test(name)) {
        results.push({ route: routePrefix || '/', file: path.relative(dirPath, fullPath) });
      }
    }
  } catch { /* ignore */ }
}

async function walkPagesDir(dir: string, dirPath: string, routePrefix: string, results: PageEntry[]) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      if (name === 'api' || name.startsWith('_') || name === 'node_modules') continue;
      const fullPath = path.join(dir, name);
      if (entry.isDirectory()) {
        await walkPagesDir(fullPath, dirPath, `${routePrefix}/${name}`, results);
      } else if (/\.(tsx|ts|jsx|js)$/.test(name)) {
        const base = name.replace(/\.(tsx|ts|jsx|js)$/, '');
        const route = base === 'index' ? (routePrefix || '/') : `${routePrefix}/${base}`;
        results.push({ route, file: path.relative(dirPath, fullPath) });
      }
    }
  } catch { /* ignore */ }
}

async function findPageFiles(dirPath: string): Promise<PageEntry[]> {
  const results: PageEntry[] = [];
  for (const base of ['app', 'src/app']) {
    const dir = path.join(dirPath, base);
    if (await fileExists(dir)) await walkAppDir(dir, dirPath, '', results);
  }
  for (const base of ['pages', 'src/pages']) {
    const dir = path.join(dirPath, base);
    if (await fileExists(dir)) await walkPagesDir(dir, dirPath, '', results);
  }
  return results;
}

// ── Find component files to pre-analyze ──────────────────────────────────────

async function findComponentFiles(dirPath: string, max = 25): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    if (results.length >= max) return;
    let entries: { name: string; isDirectory: () => boolean }[];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (results.length >= max) return;
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '__tests__') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (/\.(tsx|ts)$/.test(e.name) && !/\.(test|spec|stories)\.(tsx|ts)$/.test(e.name)) {
        results.push(path.relative(dirPath, full));
      }
    }
  }
  for (const base of ['components', 'src/components']) {
    const dir = path.join(dirPath, base);
    if (await fileExists(dir)) await walk(dir);
    if (results.length >= max) break;
  }
  return results;
}

// ── Read a page file + its direct component imports ──────────────────────────

async function readPageWithImports(pageAbsPath: string, dirPath: string, maxImports = 4): Promise<string> {
  const content = await readFile(pageAbsPath, 'utf-8').catch(() => '');
  if (!content) return '';

  const parts: string[] = [`--- ${path.relative(dirPath, pageAbsPath)} (page) ---\n${content.slice(0, 6000)}`];

  const importRe = /from\s+['"]([./][^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = importRe.exec(content)) !== null && count < maxImports) {
    const importPath = match[1];
    const baseDir = path.dirname(pageAbsPath);
    const resolved = path.resolve(baseDir, importPath);

    for (const ext of ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']) {
      const candidate = resolved + ext;
      if (candidate.includes('node_modules') || candidate.includes('.next')) continue;
      const importContent = await readFile(candidate, 'utf-8').catch(() => null);
      if (importContent) {
        const rel = path.relative(dirPath, candidate);
        parts.push(`--- ${rel} ---\n${importContent.slice(0, 4000)}`);
        count++;
        break;
      }
    }
  }

  return parts.join('\n\n');
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

  if (!dirPath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'scanning', message: 'Finding page files…' });

        const pageFiles = await findPageFiles(resolved);
        if (pageFiles.length === 0) {
          emit({ phase: 'complete', routes: {} });
          controller.close();
          return;
        }

        const subset = pageFiles.slice(0, 12); // cap at 12 pages
        emit({ phase: 'scanning', message: `Reading ${subset.length} page${subset.length === 1 ? '' : 's'}…` });

        // Build context for each page
        const pageContexts: string[] = [];
        for (const { route, file } of subset) {
          const absPath = path.join(resolved, file);
          const context = await readPageWithImports(absPath, resolved, 4);
          pageContexts.push(`## Route: ${route}\n${context}`);
        }

        emit({ phase: 'analyzing', message: 'Generating page logic summaries…' });

        const systemPrompt = `You are a React/Next.js expert. Analyze each page route and return a JSON object summarizing what data and logic drives each page.

Return ONLY a raw JSON object (no markdown fences) where each key is a route path (e.g. "/" or "/dashboard") and the value is a markdown string summary.

For each page, summarize:
- What data is fetched or queried (server components, useQuery, fetch, SWR, Prisma, etc.)
- What conditions control visibility (auth checks, feature flags, empty states, loading states)
- What state drives the content (useState, context, URL params, Zustand store)
- If it renders a list, what is the data source and what drives the list

Format the value as clean markdown with section headers where relevant (## Data, ## Conditions, ## State).
Start with a one-sentence plain-English overview as a blockquote (> This page shows...).
Be specific: use actual variable and function names from the code.
Keep each summary concise (under 250 words).

Return ONLY the JSON object like: {"/" : "markdown...", "/dashboard": "markdown..."}`;

        const userMsg = `Analyze these Next.js page routes and their imports:\n\n${pageContexts.join('\n\n---\n\n')}`;

        const response = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        });

        const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

        // Strip any accidental markdown fences
        const cleaned = raw.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

        let routes: Record<string, string> = {};
        try {
          routes = JSON.parse(cleaned);
        } catch {
          // If JSON fails, produce a minimal entry
          routes = {};
        }

        // Emit individual route events so the multi-accumulator can pick them up
        for (const [route, summary] of Object.entries(routes)) {
          emit({ phase: 'route', route, summary });
        }

        // ── Component file analysis ──────────────────────────────────────────
        const compFiles = await findComponentFiles(resolved);
        if (compFiles.length > 0) {
          emit({ phase: 'analyzing', message: `Analyzing ${compFiles.length} component${compFiles.length === 1 ? '' : 's'}…` });

          const compContexts: string[] = [];
          for (const file of compFiles) {
            const content = await readFile(path.join(resolved, file), 'utf-8').catch(() => '');
            if (content) compContexts.push(`### ${file}\n\`\`\`tsx\n${content.slice(0, 3000)}\n\`\`\``);
          }

          const compSystemPrompt = `You are a React/Next.js expert. Analyze each component file and return a JSON object describing what each component does.

Return ONLY a raw JSON object (no markdown fences) where each key is the file path (e.g. "components/Header.tsx") and the value is a concise markdown string.

For each component, describe:
- What it renders (type of UI element, purpose)
- What data/props drive its content
- What state or context it uses
- What interactions it handles

Start with a blockquote (> This component...) as a one-sentence summary.
Add ## Data, ## State, ## Interactions sections only where relevant.
Be specific: use actual variable and prop names.
Keep each under 150 words.

Return ONLY the JSON like: {"components/Foo.tsx": "markdown..."}`;

          const compUserMsg = `Analyze these React component files:\n\n${compContexts.join('\n\n')}`;

          try {
            const compResponse = await client.messages.create({
              model: 'claude-sonnet-4-5',
              max_tokens: 6000,
              system: compSystemPrompt,
              messages: [{ role: 'user', content: compUserMsg }],
            });
            const compRaw = compResponse.content[0].type === 'text' ? compResponse.content[0].text.trim() : '';
            const compCleaned = compRaw.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
            let components: Record<string, string> = {};
            try { components = JSON.parse(compCleaned); } catch { /* ignore */ }
            for (const [file, summary] of Object.entries(components)) {
              emit({ phase: 'route', route: file, summary });
              routes[file] = summary;
            }
          } catch { /* component analysis is best-effort */ }
        }

        emit({ phase: 'complete', routes });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Failed to analyze page logic' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
