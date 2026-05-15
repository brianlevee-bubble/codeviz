import type { FileTreeNode } from '@/lib/types';
import { flattenTree, treeToString, readFileContent, readFileSummary } from './file-reader';

export interface ChunkedContext {
  fileTree: string;
  primaryFiles: Array<{ path: string; relativePath: string; content: string }>;
  summarizedFiles: Array<{ path: string; relativePath: string; summary: string }>;
  totalEstimatedTokens: number;
}

const SMALL_FILE_THRESHOLD = 5 * 1024; // 5KB - always include fully
const SUMMARY_THRESHOLD = 50 * 1024; // 50KB - summarize larger files
const MAX_PRIMARY_FILES = 30;
const MAX_TOTAL_TOKENS = 150_000; // leave room for response

// Very rough token estimate: ~4 chars per token
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function buildChunkedContext(
  tree: FileTreeNode,
  rootPath: string
): Promise<ChunkedContext> {
  const allFiles = flattenTree(tree);
  const fileTree = treeToString(tree);
  let totalEstimatedTokens = estimateTokens(fileTree);

  const primaryFiles: ChunkedContext['primaryFiles'] = [];
  const summarizedFiles: ChunkedContext['summarizedFiles'] = [];

  // Sort: small files first, then by importance heuristic
  const sorted = allFiles.sort((a, b) => {
    const aScore = importanceScore(a.name, a.path);
    const bScore = importanceScore(b.name, b.path);
    return bScore - aScore;
  });

  // Phase 1: always include small files
  const smallFiles = sorted.filter((f) => (f.size ?? 0) <= SMALL_FILE_THRESHOLD);
  for (const file of smallFiles) {
    if (primaryFiles.length >= MAX_PRIMARY_FILES) break;
    const content = file.content ?? (await safeReadFile(file.path));
    if (!content) continue;
    const tokens = estimateTokens(content);
    if (totalEstimatedTokens + tokens > MAX_TOTAL_TOKENS) break;
    primaryFiles.push({
      path: file.path,
      relativePath: file.path.replace(rootPath + '/', ''),
      content,
    });
    totalEstimatedTokens += tokens;
  }

  // Phase 2: include important larger files up to limits
  const largerFiles = sorted.filter((f) => (f.size ?? 0) > SMALL_FILE_THRESHOLD);
  for (const file of largerFiles) {
    if (primaryFiles.length >= MAX_PRIMARY_FILES) break;
    if (totalEstimatedTokens > MAX_TOTAL_TOKENS * 0.7) break;

    if ((file.size ?? 0) <= SUMMARY_THRESHOLD) {
      const content = await safeReadFile(file.path);
      if (!content) continue;
      const tokens = estimateTokens(content);
      if (totalEstimatedTokens + tokens > MAX_TOTAL_TOKENS) {
        // Summarize instead
        const summary = await safeSummarize(file.path);
        if (summary) {
          summarizedFiles.push({
            path: file.path,
            relativePath: file.path.replace(rootPath + '/', ''),
            summary,
          });
          totalEstimatedTokens += estimateTokens(summary);
        }
      } else {
        primaryFiles.push({
          path: file.path,
          relativePath: file.path.replace(rootPath + '/', ''),
          content,
        });
        totalEstimatedTokens += tokens;
      }
    } else {
      // Always summarize very large files
      const summary = await safeSummarize(file.path);
      if (summary) {
        summarizedFiles.push({
          path: file.path,
          relativePath: file.path.replace(rootPath + '/', ''),
          summary,
        });
        totalEstimatedTokens += estimateTokens(summary);
      }
    }
  }

  return { fileTree, primaryFiles, summarizedFiles, totalEstimatedTokens };
}

function importanceScore(name: string, filePath: string): number {
  let score = 0;
  const lower = name.toLowerCase();
  const lowerPath = filePath.toLowerCase();

  // High-value config files
  if (lower === 'package.json') score += 100;
  if (lower === 'index.html') score += 90;
  if (lower.includes('schema') || lower.includes('prisma')) score += 80;
  if (lower === 'next.config.ts' || lower === 'next.config.js') score += 75;
  if (lower === 'app.tsx' || lower === 'app.ts' || lower === 'app.js') score += 70;
  if (lower.includes('layout')) score += 60;
  if (lower.includes('route') || lower.includes('router')) score += 55;
  if (lower.includes('middleware')) score += 55;
  if (lower.includes('auth')) score += 50;
  if (lower.includes('store') || lower.includes('context') || lower.includes('provider')) score += 45;
  if (lower.includes('index')) score += 30;
  if (lower.includes('main') || lower.includes('server')) score += 30;
  if (lower.includes('readme')) score += 20;

  // Penalize test files
  if (lowerPath.includes('/test') || lowerPath.includes('.test.') || lowerPath.includes('.spec.')) score -= 30;
  // Penalize stories
  if (lowerPath.includes('.stories.')) score -= 20;

  return score;
}

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFileContent(path);
  } catch {
    return null;
  }
}

async function safeSummarize(path: string): Promise<string | null> {
  try {
    return await readFileSummary(path);
  } catch {
    return null;
  }
}

export function buildAnalysisPrompt(context: ChunkedContext, rootPath: string): string {
  const parts: string[] = [];

  parts.push(`PROJECT ROOT: ${rootPath}`);
  parts.push('\n=== FILE TREE ===\n' + context.fileTree);

  if (context.primaryFiles.length > 0) {
    parts.push('\n=== FILE CONTENTS ===');
    for (const f of context.primaryFiles) {
      parts.push(`\n--- ${f.relativePath} ---\n${f.content}`);
    }
  }

  if (context.summarizedFiles.length > 0) {
    parts.push('\n=== FILE SUMMARIES (truncated) ===');
    for (const f of context.summarizedFiles) {
      parts.push(`\n--- ${f.relativePath} (summary) ---\n${f.summary}`);
    }
  }

  return parts.join('\n');
}
