import Anthropic from '@anthropic-ai/sdk';
import type { CodeOperation, FileDiff } from '@/lib/types';
import { buildCodeChangePrompt } from './operation-mapper';
import { readFileContent } from '@/lib/analyzer/file-reader';
import path from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const client = new Anthropic();

const SKIP_DIRS = ['node_modules', '.git', '.next', 'dist', 'build'];

const SYSTEM_PROMPT = `You are a code modification assistant. You receive a list of operations to apply to a codebase and the current file contents.

Apply the operations faithfully and return only files that actually need to change.
Preserve the coding style, formatting conventions, and patterns of the existing codebase.
For new files, generate code that matches the project's style.
IMPORTANT: Only modify source files. Never return paths inside node_modules, .next, dist, build, or .git directories.
Always use relative file paths (e.g. "app/page.tsx", not "/absolute/path/app/page.tsx").
Return ONLY valid JSON, no markdown fences, no explanation.`;

/** Returns true if all operations are style_change (visual editor edits). */
function isStyleOnlyBatch(operations: CodeOperation[]): boolean {
  return operations.length > 0 && operations.every((op) => op.params.instruction !== undefined);
}

/**
 * Extract a numbered snippet around a target line so Claude sees only the
 * relevant element, not the whole file.
 */
function extractSnippet(content: string, lineNumber: number, context = 12): string {
  const lines = content.split('\n');
  const start = Math.max(0, lineNumber - 1 - context);
  const end = Math.min(lines.length - 1, lineNumber - 1 + context);
  return lines
    .slice(start, end + 1)
    .map((l, i) => `${start + i + 1}${start + i + 1 === lineNumber ? ' ◄' : '  '} ${l}`)
    .join('\n');
}

/**
 * For style_change ops, grep for the most specific class token and return only
 * the single best-matching file — keeps the Claude context small and fast.
 */
async function findBestFileForStyleOp(
  op: CodeOperation,
  directoryPath: string
): Promise<Record<string, string>> {
  const className = (op.params.elementClassName as string) ?? '';
  const tokens = className.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};

  // Build candidate search strings from most-specific to least-specific:
  // Try progressively shorter substrings of the class list until we get a hit.
  // e.g. "flex items-center gap-2 text-sm" → try all 4, then 3, then 2
  const searchCandidates: string[] = [];
  for (let len = Math.min(tokens.length, 5); len >= 2; len--) {
    for (let start = 0; start <= tokens.length - len; start++) {
      searchCandidates.push(tokens.slice(start, start + len).join(' '));
    }
  }
  // Fall back to the single longest token
  const longestToken = [...tokens].sort((a, b) => b.length - a.length)[0];
  if (longestToken && longestToken.length > 4) searchCandidates.push(longestToken);

  const grepArgs = '--include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js" --include="*.css" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=dist --exclude-dir=build';

  for (const needle of searchCandidates) {
    try {
      const raw = execSync(
        `grep -rl ${JSON.stringify(needle)} ${JSON.stringify(directoryPath)} ${grepArgs} 2>/dev/null`,
        { encoding: 'utf8', timeout: 5000 }
      );
      const matches = raw.trim().split('\n').filter(Boolean).map((absPath) => {
        const relPath = path.relative(directoryPath, absPath);
        return { absPath, relPath };
      }).filter(({ relPath }) =>
        !SKIP_DIRS.some((d) => relPath.startsWith(d + '/') || relPath.startsWith(d + '\\'))
      );

      if (matches.length === 0) continue;

      // Prefer source directories over generated files
      const preferred = matches.find(({ relPath }) =>
        relPath.startsWith('components/') || relPath.startsWith('app/') || relPath.startsWith('src/')
      ) ?? matches[0];

      try {
        const content = await readFileContent(preferred.absPath);
        return { [preferred.relPath]: content };
      } catch { continue; }
    } catch { /* grep found nothing or timed out */ }
  }
  return {};
}

export async function generateCodeChanges(
  operations: CodeOperation[],
  directoryPath: string
): Promise<FileDiff[]> {
  if (operations.length === 0) return [];

  const isStyleOnly = isStyleOnlyBatch(operations);
  const fileContents: Record<string, string> = {};

  // Named target files (non-wildcard ops)
  const targetFiles = new Set(
    operations.map((op) => op.targetFile).filter((f) => f && f !== '*')
  );
  for (const relPath of targetFiles) {
    const absPath = path.resolve(directoryPath, relPath);
    if (!absPath.startsWith(directoryPath)) continue;
    if (existsSync(absPath)) {
      try { fileContents[relPath] = await readFileContent(absPath); } catch { /* skip */ }
    }
  }

  // For style changes: use React source file if available, otherwise grep
  for (const op of operations) {
    if (op.targetFile !== '*') continue;
    const rawSrcFile = op.params.sourceFile as string | undefined;
    if (rawSrcFile) {
      // Normalize absolute → relative so Claude returns relative paths
      const absPath = rawSrcFile.startsWith('/') ? rawSrcFile : path.resolve(directoryPath, rawSrcFile);
      const relPath = path.relative(directoryPath, absPath);
      if (!SKIP_DIRS.some((d) => relPath.startsWith(d + '/'))) {
        if (!fileContents[relPath]) {
          try { fileContents[relPath] = await readFileContent(absPath); } catch { /* skip */ }
        }
        op.params.sourceFile = relPath;

        // If we have a line number, attach a focused snippet so Claude targets
        // the exact element instead of guessing among similar ones.
        const lineNum = op.params.sourceLine ? parseInt(op.params.sourceLine as string, 10) : NaN;
        if (!isNaN(lineNum) && fileContents[relPath]) {
          op.params.elementSnippet = extractSnippet(fileContents[relPath], lineNum);
          // Tighten the instruction to reference the snippet
          op.params.instruction =
            `The exact element is marked with ◄ in the snippet below (line ${lineNum} of ${relPath}):\n` +
            `\`\`\`\n${op.params.elementSnippet}\n\`\`\`\n` +
            `Modify ONLY the element on line ${lineNum}. ` +
            `Apply the style changes. If Tailwind: replace/add the correct utility classes. ` +
            `If CSS modules: update only that rule. If inline styles: update the style prop. ` +
            `Return the full updated file as "${relPath}".`;
        }
      }
    } else {
      const best = await findBestFileForStyleOp(op, directoryPath);
      Object.assign(fileContents, best);
    }
  }

  const prompt = buildCodeChangePrompt(operations, fileContents);

  // Style-only batches use haiku — simple find-and-replace, much faster
  const model = isStyleOnly ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';

  const message = await client.messages.create({
    model,
    max_tokens: isStyleOnly ? 4096 : 16384,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  // Strip markdown fences, then extract the first {...} JSON object
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');

  const jsonStart = stripped.indexOf('{');
  const jsonEnd = stripped.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`No JSON object found in response: ${stripped.slice(0, 200)}`);
  }
  const jsonStr = stripped.slice(jsonStart, jsonEnd + 1);

  const parsed = JSON.parse(jsonStr) as { files: Array<{ path: string; content: string | null }> };

  return parsed.files
    .filter((f) => !SKIP_DIRS.some((d) => f.path.startsWith(d + '/') || f.path.startsWith(d + '\\')))
    .map((f) => ({
      file: f.path,
      before: fileContents[f.path] ?? '',
      after: f.content ?? '',
    }));
}
