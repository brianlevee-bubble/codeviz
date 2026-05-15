export const runtime = 'nodejs';

import path from 'path';
import { stat, readFile } from 'fs/promises';
import { walkDirectory, flattenTree } from '@/lib/analyzer/file-reader';
import type { DeadCodeReport, ExportedSymbol, ExportCategory, DeadCodeSafety } from '@/lib/dead-code/types';

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ─── Regex patterns ────────────────────────────────────────────────────────────

// Named exports: export const/function/class/type/interface/enum Foo
const NAMED_EXPORT_RE = /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(const|function|class|type|interface|enum|let|var)\s+(\w+)/gm;
// Export list: export { Foo, Bar as Baz }
const EXPORT_LIST_RE = /^export\s*\{([^}]+)\}/gm;
// Default export: export default function Foo / class Foo / Foo
const DEFAULT_EXPORT_RE = /^export\s+default\s+(?:(?:async\s+)?function\s+(\w+)|class\s+(\w+)|(\w+))/gm;
// Re-export (skip): export { Foo } from '...'
const REEXPORT_RE = /^export\s*\{[^}]*\}\s*from/m;

// Import extraction
const NAMED_IMPORT_RE = /import\s*\{([^}]+)\}\s*from/g;
const DEFAULT_IMPORT_RE = /import\s+(\w+)\s*(?:,\s*\{[^}]*\})?\s*from/g;
const NAMESPACE_IMPORT_RE = /import\s*\*\s*as\s+\w+\s+from\s+['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function classifyCategory(keyword: string, name: string, filePath: string): ExportCategory {
  if (keyword === 'type' || keyword === 'interface') return 'Type';
  if (keyword === 'class') return 'Class';
  if (keyword === 'function') return name[0] === name[0].toUpperCase() && name[0].match(/[A-Z]/) ? 'Component' : 'Function';
  if (keyword === 'const' || keyword === 'let' || keyword === 'var') {
    // Uppercase first letter + components dir = likely a component
    if (name[0].match(/[A-Z]/) && (filePath.includes('/components/') || filePath.includes('/ui/'))) return 'Component';
    if (name[0].match(/[A-Z]/)) return 'Component'; // PascalCase const = likely component
    return 'Constant';
  }
  if (keyword === 'enum') return 'Type';
  return 'Unknown';
}

function classifySafety(name: string, isDefault: boolean, relPath: string, hasNamespaceImporter: boolean): { safety: DeadCodeSafety; reason: string } {
  // Next.js convention files — exported by framework contract, not by import
  const basename = path.basename(relPath);
  if (
    basename.match(/^(page|layout|loading|error|not-found|route|template|default|global-error)\.(tsx?|jsx?)$/) ||
    relPath.match(/\/(page|layout|route)\.(tsx?|jsx?)$/)
  ) {
    return { safety: 'external_api', reason: 'Next.js framework convention' };
  }

  // Barrel / index files
  if (basename.match(/^index\.(tsx?|jsx?|mjs|cjs)$/)) {
    return { safety: 'external_api', reason: 'Barrel file — may be consumed externally' };
  }

  // Middleware
  if (relPath.match(/^middleware\.(tsx?|jsx?)$/)) {
    return { safety: 'external_api', reason: 'Next.js middleware convention' };
  }

  if (hasNamespaceImporter) {
    return { safety: 'needs_review', reason: 'Namespace import found — may be consumed dynamically' };
  }

  // PascalCase in components/ could be lazy-loaded
  if (name[0].match(/[A-Z]/) && (relPath.includes('/components/') || relPath.includes('/ui/'))) {
    return { safety: 'needs_review', reason: 'UI component — might be dynamically imported' };
  }

  return { safety: 'safe_to_delete', reason: 'No imports found across the project' };
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

  if (!dirPath || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);

  try {
    const s = await stat(resolved);
    if (!s.isDirectory()) return Response.json({ error: 'Not a directory' }, { status: 400 });
  } catch {
    return Response.json({ error: 'Directory not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'reading', message: 'Walking files…' });

        const tree = await walkDirectory(resolved);
        const allFiles = flattenTree(tree).filter(
          f =>
            f.type === 'file' &&
            f.path.match(/\.(tsx?|jsx?|mjs|cjs)$/) &&
            !f.path.match(/\.(test|spec)\.(tsx?|jsx?)$/) &&
            !f.path.match(/\.(d\.ts)$/)
        );

        // ── Phase 1: Extract all exports ──────────────────────────────────────
        emit({ phase: 'analyzing', message: 'Extracting exports…' });

        interface ExportEntry {
          name: string;
          keyword: string;
          isDefault: boolean;
          relPath: string;
          line: number;
          exportLine: string;
        }
        const allExports: ExportEntry[] = [];
        // Track which files have namespace imports pointing at them
        const namespaceImportedFiles = new Set<string>();

        // Track dynamic import targets
        const dynamicImportedFiles = new Set<string>();

        const fileContents = new Map<string, string>();

        for (const file of allFiles) {
          const relPath = path.relative(resolved, file.path);
          let content: string;
          try {
            content = await readFile(file.path, 'utf-8');
          } catch { continue; }
          fileContents.set(relPath, content);

          const lines = content.split('\n');

          // Named exports
          let m: RegExpExecArray | null;
          const namedRe = new RegExp(NAMED_EXPORT_RE.source, NAMED_EXPORT_RE.flags);
          while ((m = namedRe.exec(content)) !== null) {
            const keyword = m[1];
            const name = m[2];
            const lineIdx = content.slice(0, m.index).split('\n').length - 1;
            const exportLine = lines[lineIdx]?.trim().slice(0, 120) ?? m[0].slice(0, 120);
            allExports.push({ name, keyword, isDefault: false, relPath, line: lineIdx + 1, exportLine });
          }

          // Export lists (not re-exports)
          const listRe = new RegExp(EXPORT_LIST_RE.source, EXPORT_LIST_RE.flags);
          while ((m = listRe.exec(content)) !== null) {
            const fullMatch = m[0];
            if (REEXPORT_RE.test(fullMatch)) continue; // skip re-exports
            const lineIdx = content.slice(0, m.index).split('\n').length - 1;
            const names = m[1].split(',').map(s => {
              const parts = s.trim().split(/\s+as\s+/);
              return parts[0].trim();
            }).filter(Boolean);
            for (const name of names) {
              if (!name || name === 'default') continue;
              allExports.push({ name, keyword: 'const', isDefault: false, relPath, line: lineIdx + 1, exportLine: fullMatch.slice(0, 120) });
            }
          }

          // Default exports
          const defaultRe = new RegExp(DEFAULT_EXPORT_RE.source, DEFAULT_EXPORT_RE.flags);
          while ((m = defaultRe.exec(content)) !== null) {
            const name = m[1] ?? m[2] ?? m[3] ?? 'default';
            const lineIdx = content.slice(0, m.index).split('\n').length - 1;
            const exportLine = lines[lineIdx]?.trim().slice(0, 120) ?? m[0].slice(0, 120);
            allExports.push({ name, keyword: 'default', isDefault: true, relPath, line: lineIdx + 1, exportLine });
          }
        }

        // ── Phase 2: Extract all imports ──────────────────────────────────────
        emit({ phase: 'analyzing', message: 'Cross-referencing imports…' });

        const importedNames = new Set<string>();

        for (const [, content] of fileContents) {
          // Named imports
          const namedRe = new RegExp(NAMED_IMPORT_RE.source, NAMED_IMPORT_RE.flags);
          let m: RegExpExecArray | null;
          while ((m = namedRe.exec(content)) !== null) {
            m[1].split(',').forEach(s => {
              const name = s.trim().split(/\s+as\s+/)[0].trim();
              if (name) importedNames.add(name);
            });
          }

          // Default imports
          const defRe = new RegExp(DEFAULT_IMPORT_RE.source, DEFAULT_IMPORT_RE.flags);
          while ((m = defRe.exec(content)) !== null) {
            if (m[1] && m[1] !== 'type') importedNames.add(m[1]);
          }

          // Namespace imports — flag the source module
          const nsRe = new RegExp(NAMESPACE_IMPORT_RE.source, NAMESPACE_IMPORT_RE.flags);
          while ((m = nsRe.exec(content)) !== null) {
            namespaceImportedFiles.add(m[1]);
          }

          // Dynamic imports — flag the source module
          const dynRe = new RegExp(DYNAMIC_IMPORT_RE.source, DYNAMIC_IMPORT_RE.flags);
          while ((m = dynRe.exec(content)) !== null) {
            dynamicImportedFiles.add(m[1]);
          }
        }

        // ── Phase 3: Cross-reference ──────────────────────────────────────────
        const deadExports: ExportedSymbol[] = [];
        const totalExports = allExports.length;

        for (const exp of allExports) {
          // If name is imported anywhere, skip
          if (importedNames.has(exp.name)) continue;

          const hasNsImport = namespaceImportedFiles.has(exp.relPath) ||
            [...namespaceImportedFiles].some(f => exp.relPath.includes(f));

          const { safety, reason } = classifySafety(exp.name, exp.isDefault, exp.relPath, hasNsImport);
          const category: ExportCategory = exp.isDefault ? 'Default' : classifyCategory(exp.keyword, exp.name, exp.relPath);

          deadExports.push({
            id: `${exp.relPath}::${exp.name}`,
            name: exp.name,
            category,
            file: exp.relPath,
            line: exp.line,
            exportLine: exp.exportLine,
            isDefaultExport: exp.isDefault,
            safety,
            safetyReason: reason,
          });
        }

        // ── Stats ─────────────────────────────────────────────────────────────
        const byCategory: Record<string, number> = {};
        const bySafety: Record<string, number> = {};
        const fileCounts: Record<string, number> = {};

        for (const sym of deadExports) {
          byCategory[sym.category] = (byCategory[sym.category] ?? 0) + 1;
          bySafety[sym.safety] = (bySafety[sym.safety] ?? 0) + 1;
          fileCounts[sym.file] = (fileCounts[sym.file] ?? 0) + 1;
        }

        const mostAffectedFile = Object.entries(fileCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

        const report: DeadCodeReport = {
          deadExports,
          stats: {
            totalExports,
            deadExports: deadExports.length,
            byCategory,
            bySafety,
            mostAffectedFile,
          },
        };

        emit({ phase: 'complete', graph: report });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Analysis failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
