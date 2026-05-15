import { readFile } from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { existsSync } from 'fs';
import { findFilesByExtension, firstExisting } from '@/lib/schema/file-finder';
import type { UIFramework, UIRoute, UINavEdge, UIFlowGraph } from './types';
import { isDynamicRoute } from './types';

// ─── Framework Detection ──────────────────────────────────────────────────────

export async function detectFramework(dirPath: string): Promise<UIFramework> {
  const pkg = await readFile(path.join(dirPath, 'package.json'), 'utf-8').catch(() => '{}');
  const deps = { ...JSON.parse(pkg).dependencies, ...JSON.parse(pkg).devDependencies };

  if (deps['next']) {
    // Support both `app/` and `src/app/` layouts
    const hasAppDir = await firstExisting([
      path.join(dirPath, 'app'),
      path.join(dirPath, 'src', 'app'),
    ]);
    if (hasAppDir) return 'next-app';

    const hasPagesDir = await firstExisting([
      path.join(dirPath, 'pages'),
      path.join(dirPath, 'src', 'pages'),
    ]);
    return hasPagesDir ? 'next-pages' : 'next-app'; // default to app router for newer Next.js
  }
  if (deps['react-router-dom'] || deps['react-router']) return 'react-router';
  if (deps['express']) return 'express';
  return 'unknown';
}

// ─── Route Extraction ─────────────────────────────────────────────────────────

/**
 * Normalise a file's relative path so it always starts with `app/` or `pages/`,
 * stripping any leading `src/` prefix. Returns null if it's not a route file.
 */
function normaliseRelPath(relPath: string): string {
  // Strip leading src/ so the rest of the logic is uniform
  return relPath.replace(/^src\//, '');
}

function filePathToRoute(relPath: string, framework: UIFramework): string | null {
  const p = normaliseRelPath(relPath);

  if (framework === 'next-app') {
    // app/page.tsx                     → /
    // app/dashboard/page.tsx           → /dashboard
    // app/(auth)/login/page.tsx        → /login   (strip route groups)
    // app/users/[id]/page.tsx          → /users/:id
    // app/blog/[...slug]/page.tsx      → /blog/:slug*
    const match = p.match(/^app\/(.+)\/page\.[jt]sx?$/) ||
                  p.match(/^(app)\/page\.[jt]sx?$/);
    if (!match) return null;
    // First form: match[1] is the directory path; second form: empty string
    const segment = match[1] === 'app' ? '' : (match[1] ?? '');
    const route = '/' + segment
      .replace(/\(.*?\)\//g, '')              // (group)/ → strip
      .replace(/\[\.\.\.(\w+)\]/g, ':$1*')   // [...slug] → :slug*
      .replace(/\[(\w+)\]/g, ':$1')           // [id] → :id
      .replace(/\/+$/, '')                    // trailing slash
      .replace(/\/+/g, '/');
    return route || '/';
  }

  if (framework === 'next-pages') {
    if (!p.match(/^pages\//)) return null;
    if (p.includes('/api/')) return null;
    return '/' + p
      .replace(/^pages\//, '')
      .replace(/\/index\.[jt]sx?$/, '')
      .replace(/\.[jt]sx?$/, '')
      .replace(/\[(\w+)\]/g, ':$1')
      .replace(/\/+$/, '');
  }

  return null;
}

function labelFromPath(routePath: string): string {
  if (routePath === '/') return 'Home';
  const parts = routePath.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last?.startsWith(':')) {
    return parts[parts.length - 2]
      ? capitalize(parts[parts.length - 2]) + ' Detail'
      : 'Detail';
  }
  return last ? capitalize(last.replace(/-/g, ' ')) : 'Page';
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function extractNextRoutes(dirPath: string, framework: UIFramework): Promise<UIRoute[]> {
  const sourceFiles = await findFilesByExtension(dirPath, ['.tsx', '.ts', '.jsx', '.js'], 10);
  const routes: UIRoute[] = [];
  const seen = new Set<string>();

  for (const absFile of sourceFiles) {
    const relFile = path.relative(dirPath, absFile);
    if (relFile.includes('node_modules') || relFile.includes('.next')) continue;

    const routePath = filePathToRoute(relFile, framework);
    if (!routePath || seen.has(routePath)) continue;
    seen.add(routePath);

    const id = 'route_' + routePath
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/^_+/, '')
      .replace(/_+/g, '_')
      .replace(/_+$/, '');
    routes.push({
      id,
      path: routePath,
      file: relFile,
      label: labelFromPath(routePath),
    });
  }

  return routes.sort((a, b) => a.path.localeCompare(b.path));
}

// ─── Navigation Analysis ──────────────────────────────────────────────────────

/** Read a file's content plus any local relative imports (one level deep). */
async function readWithImports(absFile: string, dirPath: string): Promise<string> {
  let content: string;
  try { content = await readFile(absFile, 'utf-8'); } catch { return ''; }

  const importRe = /from ['"](\.[^'"]+)['"]/g;
  const parts = [content];
  let m: RegExpExecArray | null;
  const seen = new Set([absFile]);

  while ((m = importRe.exec(content)) !== null) {
    const importPath = m[1];
    const base = path.resolve(path.dirname(absFile), importPath);
    for (const ext of ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']) {
      const candidate = base.endsWith(ext) ? base : base + ext;
      if (seen.has(candidate)) continue;
      if (!candidate.startsWith(dirPath)) continue;
      seen.add(candidate);
      const imp = await readFile(candidate, 'utf-8').catch(() => null);
      if (imp) parts.push(`\n// imported: ${path.relative(dirPath, candidate)}\n${imp}`);
      break;
    }
  }

  return parts.join('\n');
}

async function scanNavigation(dirPath: string, routes: UIRoute[]): Promise<UINavEdge[]> {
  const client = new Anthropic();

  const routeList = routes.map(r => `${r.path} (id: ${r.id}, file: ${r.file})`).join('\n');

  // Build per-route source content
  const routeSources: Array<{ route: UIRoute; source: string }> = [];
  for (const route of routes) {
    const absFile = path.join(dirPath, route.file);
    const source = await readWithImports(absFile, dirPath);
    if (source) routeSources.push({ route, source });
  }

  const prompt = `You are analyzing navigation in a web app. Given the source code for each page, identify ALL navigation edges: links, button clicks, router.push calls, redirects, form submissions that navigate, etc.

Known routes:
${routeList}

For each page below, find every way a user can navigate from that page to another page.
Return ONLY a valid JSON array, no markdown:

[
  {
    "sourceId": "route id",
    "targetPath": "destination URL path",
    "label": "button/link text or null",
    "navType": "link" | "push" | "redirect"
  }
]

Rules:
- Only include edges between KNOWN routes listed above
- Include navigation triggered by buttons with onClick handlers (router.push, navigate, etc.)
- Include <Link href=...> and <a href=...>
- Ignore navigation to external URLs or dynamic paths you can't resolve to a known route
- A shared nav/header component that appears on every page should NOT create edges (skip site-wide chrome)
- Focus on page-specific navigation: buttons, CTAs, row clicks, form submits
- Return [] if no inter-page navigation found

Page sources:
${routeSources.map(({ route, source }) =>
  `\n=== ${route.path} (${route.file}) ===\n${source.slice(0, 6000)}`
).join('\n')}`;

  const edges: UINavEdge[] = [];
  try {
    const msg = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const raw = JSON.parse(jsonMatch[0]) as Array<{
      sourceId: string;
      targetPath: string;
      label?: string;
      navType: UINavEdge['navType'];
    }>;

    const routeById = new Map(routes.map(r => [r.id, r]));
    const routeByPath = new Map(routes.map(r => [r.path, r]));
    const edgeKeys = new Set<string>();

    for (const item of raw) {
      const source = routeById.get(item.sourceId);
      const target = routeByPath.get(item.targetPath) ||
        routes.find(r => {
          const pattern = new RegExp(
            '^' + r.path.replace(/:[^/]+\*/g, '.+').replace(/:[^/]+/g, '[^/]+') + '$'
          );
          return pattern.test(item.targetPath);
        });
      if (!source || !target || source.id === target.id) continue;
      const key = `${source.id}→${target.id}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        id: `nav_${edges.length}`,
        source: source.id,
        target: target.id,
        label: item.label ?? undefined,
        navType: item.navType ?? 'link',
      });
    }
  } catch {
    // Fall back to empty on error
  }

  return edges;
}

// ─── Port Detection ───────────────────────────────────────────────────────────

async function detectPort(dirPath: string, excludePort?: number): Promise<number | null> {
  try {
    const launchJson = await readFile(
      path.join(process.env.HOME ?? '', '.claude', 'launch.json'),
      'utf-8'
    );
    const config = JSON.parse(launchJson);
    const entry = config.configurations?.find((c: { cwd?: string }) =>
      c.cwd && path.resolve(c.cwd) === path.resolve(dirPath)
    );
    if (entry?.port && entry.port !== excludePort) return entry.port;
  } catch {}

  // Fallback: probe common ports, skipping CodeViz's own port
  for (const port of [3000, 3001, 3002, 3003, 5173, 4000, 8080, 8000]) {
    if (port === excludePort) continue;
    try {
      const res = await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(300) });
      if (res.ok) return port;
    } catch {}
  }

  return null;
}

// ─── Example URL finder ───────────────────────────────────────────────────────

async function findExampleUrls(dirPath: string, routes: UIRoute[], port: number | null): Promise<void> {
  const dynamicRoutes = routes.filter(r => isDynamicRoute(r.path));
  if (dynamicRoutes.length === 0) return;

  // Collect seed/fixture/test files that are likely to contain real IDs
  const candidatePaths: string[] = [
    'prisma/seed.ts', 'prisma/seed.js', 'prisma/seed.mjs',
    'prisma/dev.db', // skip binary — won't be added
    'scripts/seed.ts', 'scripts/seed.js',
    'db/seed.ts', 'db/seed.js',
    'seed.ts', 'seed.js',
    '.env.test', '.env.example', '.env.local',
  ];

  const seedFiles: Array<{ file: string; content: string }> = [];

  for (const rel of candidatePaths) {
    if (rel.endsWith('.db')) continue;
    const abs = path.join(dirPath, rel);
    if (!existsSync(abs)) continue;
    const content = await readFile(abs, 'utf-8').catch(() => null);
    if (content) seedFiles.push({ file: rel, content: content.slice(0, 8000) });
  }

  // Also check e2e / fixture / test directories
  const extraDirs = ['e2e', 'cypress', 'playwright', 'tests', '__tests__', 'fixtures', '__fixtures__', 'mocks', '__mocks__'];
  for (const dir of extraDirs) {
    const abs = path.join(dirPath, dir);
    if (!existsSync(abs)) continue;
    const files = await findFilesByExtension(abs, ['.ts', '.js', '.json', '.mjs'], 3);
    for (const f of files.slice(0, 5)) {
      const content = await readFile(f, 'utf-8').catch(() => null);
      if (content) seedFiles.push({ file: path.relative(dirPath, f), content: content.slice(0, 4000) });
    }
  }

  if (seedFiles.length === 0) return;

  const client = new Anthropic();
  const routeList = dynamicRoutes.map(r => `${r.id}: ${r.path}`).join('\n');
  const fileBlocks = seedFiles.map(({ file, content }) => `=== ${file} ===\n${content}`).join('\n\n');

  const prompt = `You are analyzing seed/fixture/test files from a web app to find real example values for dynamic URL parameters.

Dynamic routes that need example URLs:
${routeList}

Source files:
${fileBlocks}

For each route, extract real ID/slug values from the files above and return a JSON object mapping route id to a full example path (just the path, no host). Only include routes where you found concrete values. Return ONLY valid JSON, no markdown:

{
  "route_id_here": "/teams/real-slug/projects/real-id",
  ...
}

Rules:
- Use actual values found in the files, not made-up ones
- Slugs should look like real slugs (e.g. "team-2", "my-project"), IDs like real CUIDs/UUIDs (e.g. "clx...")
- If you can't find real values for a route, omit it from the response
- Return {} if nothing found`;

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const examples = JSON.parse(jsonMatch[0]) as Record<string, string>;
    const baseUrl = port ? `http://localhost:${port}` : '';
    for (const route of dynamicRoutes) {
      const exPath = examples[route.id];
      if (exPath) route.exampleUrl = baseUrl ? `${baseUrl}${exPath}` : exPath;
    }
  } catch {
    // Non-fatal — dynamic routes just won't have example URLs
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scanUIFlow(dirPath: string, excludePort?: number): Promise<UIFlowGraph> {
  const framework = await detectFramework(dirPath);
  const port = await detectPort(dirPath, excludePort);

  let routes: UIRoute[] = [];
  let edges: UINavEdge[] = [];

  if (framework === 'next-app' || framework === 'next-pages') {
    routes = await extractNextRoutes(dirPath, framework);
    edges = await scanNavigation(dirPath, routes);
  }

  // Find real example URLs for dynamic routes
  await findExampleUrls(dirPath, routes, port);

  // Attach existing screenshot URLs
  const { createHash } = await import('crypto');
  const projectHash = createHash('md5').update(dirPath).digest('hex').slice(0, 8);

  for (const route of routes) {
    const absPath = path.join(process.cwd(), 'public', 'ui-captures', projectHash, `${route.id}.jpg`);
    if (existsSync(absPath)) route.screenshotUrl = `/ui-captures/${projectHash}/${route.id}.jpg`;
  }

  return { projectPath: dirPath, framework, port, routes, edges };
}
