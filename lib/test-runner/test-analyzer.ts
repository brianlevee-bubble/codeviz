import { readFile } from 'fs/promises';
import path from 'path';
import { findFilesByExtension } from '@/lib/schema/file-finder';
import type { TestRunner, ExistingTestFile, TestsAnalysis } from './types';

// ─── Runner Detection ────────────────────────────────────────────────────────

export async function detectTestRunner(dirPath: string): Promise<{
  runner: TestRunner;
  runAllCommand: string;
  packageTestScript: string | null;
}> {
  const { access } = await import('fs/promises');

  async function fileExists(p: string) {
    try { await access(p); return true; } catch { return false; }
  }

  const pkgRaw = await readFile(path.join(dirPath, 'package.json'), 'utf-8').catch(() => '{}');
  const pkg = JSON.parse(pkgRaw);
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
  const scripts = (pkg.scripts ?? {}) as Record<string, string>;
  const allScripts = Object.values(scripts).join(' ');

  // ── Signal 1: explicit dependencies ────────────────────────────────────────
  const hasDep = (names: string[]) => names.some(n => n in allDeps);

  // ── Signal 2: config files present ─────────────────────────────────────────
  const vitestConfigExists = await (async () => {
    const candidates = ['vitest.config.ts','vitest.config.js','vitest.config.mts','vitest.config.mjs'];
    for (const c of candidates) { if (await fileExists(path.join(dirPath, c))) return true; }
    return false;
  })();

  const jestConfigExists = await (async () => {
    const candidates = ['jest.config.ts','jest.config.js','jest.config.mjs','jest.config.cjs'];
    for (const c of candidates) { if (await fileExists(path.join(dirPath, c))) return true; }
    // Also check for jest key in package.json
    return 'jest' in pkg;
  })();

  // ── Signal 3: scripts mention the runner ────────────────────────────────────
  const scriptMentions = (pattern: RegExp) => pattern.test(allScripts);

  // ── Priority order ──────────────────────────────────────────────────────────
  if (hasDep(['@playwright/test', 'playwright']) || scriptMentions(/playwright/)) {
    return { runner: 'playwright', runAllCommand: 'npx playwright test', packageTestScript: scripts.test ?? null };
  }
  if (hasDep(['cypress']) || scriptMentions(/cypress/)) {
    return { runner: 'cypress', runAllCommand: 'npx cypress run', packageTestScript: scripts.test ?? null };
  }
  if (hasDep(['vitest']) || vitestConfigExists || scriptMentions(/vitest/)) {
    return { runner: 'vitest', runAllCommand: 'npx vitest run', packageTestScript: scripts.test ?? null };
  }
  if (hasDep(['jest', 'ts-jest', '@jest/core', 'babel-jest', '@swc/jest']) || jestConfigExists || scriptMentions(/jest/)) {
    return { runner: 'jest', runAllCommand: 'npx jest', packageTestScript: scripts.test ?? null };
  }

  // ── Signal 4: installed binaries in node_modules/.bin ─────────────────────
  const hasBin = async (name: string) =>
    fileExists(path.join(dirPath, 'node_modules', '.bin', name));

  if (await hasBin('vitest')) {
    return { runner: 'vitest', runAllCommand: 'npx vitest run', packageTestScript: scripts.test ?? null };
  }
  if (await hasBin('jest')) {
    return { runner: 'jest', runAllCommand: 'npx jest', packageTestScript: scripts.test ?? null };
  }
  if (await hasBin('playwright')) {
    return { runner: 'playwright', runAllCommand: 'npx playwright test', packageTestScript: scripts.test ?? null };
  }

  // ── Fallback: if there's a test script, at least use it ────────────────────
  return {
    runner: 'none',
    runAllCommand: scripts.test ? 'npm test' : '',
    packageTestScript: scripts.test ?? null,
  };
}

// Build the command + args to run a specific test file
export function buildRunCommand(
  runner: TestRunner,
  testFile: string | null,
  packageTestScript: string | null
): { cmd: string; args: string[] } {
  if (testFile) {
    switch (runner) {
      case 'vitest':
        return { cmd: 'npx', args: ['vitest', 'run', testFile] };
      case 'jest':
        return { cmd: 'npx', args: ['jest', '--testPathPattern', testFile, '--no-coverage'] };
      case 'playwright':
        return { cmd: 'npx', args: ['playwright', 'test', testFile] };
      case 'none':
        if (packageTestScript?.includes('vitest'))
          return { cmd: 'npx', args: ['vitest', 'run', testFile] };
        if (packageTestScript?.includes('jest'))
          return { cmd: 'npx', args: ['jest', '--testPathPattern', testFile, '--no-coverage'] };
        if (packageTestScript)
          return { cmd: 'npm', args: ['test', '--', testFile] };
        return { cmd: 'node', args: ['-e', 'process.stderr.write("No test runner detected. Add vitest or jest to devDependencies.\\n"); process.exit(1);'] };
    }
  }

  // Run all
  switch (runner) {
    case 'vitest':
      return { cmd: 'npx', args: ['vitest', 'run'] };
    case 'jest':
      return { cmd: 'npx', args: ['jest', '--no-coverage'] };
    case 'playwright':
      return { cmd: 'npx', args: ['playwright', 'test'] };
    default:
      if (packageTestScript) return { cmd: 'npm', args: ['test'] };
      return { cmd: 'node', args: ['-e', 'process.stderr.write("No test runner detected. Add vitest or jest to devDependencies.\\n"); process.exit(1);'] };
  }
}

// ─── Find Existing Tests ─────────────────────────────────────────────────────

export async function findExistingTests(dirPath: string): Promise<ExistingTestFile[]> {
  const all = await findFilesByExtension(
    dirPath,
    ['.test.ts', '.test.tsx', '.test.js', '.spec.ts', '.spec.tsx', '.spec.js'],
    10
  );

  const results: ExistingTestFile[] = [];
  const { stat } = await import('fs/promises');

  for (const absPath of all) {
    const relPath = path.relative(dirPath, absPath);
    if (relPath.startsWith('node_modules') || relPath.startsWith('.next')) continue;
    const s = await stat(absPath).catch(() => null);
    results.push({ relativePath: relPath, absPath, sizeBytes: s?.size ?? 0 });
  }

  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

// ─── Build Suggest-tests prompt context ─────────────────────────────────────

export async function buildTestContext(
  dirPath: string,
  runner: TestRunner
): Promise<string> {
  // Read key files: package.json + top-level source files
  const { walkDirectory, treeToString } = await import('@/lib/analyzer/file-reader');
  const { buildChunkedContext } = await import('@/lib/analyzer/chunker');

  const tree = await walkDirectory(dirPath);
  const treeStr = treeToString(tree);
  const context = await buildChunkedContext(tree, dirPath);

  const parts: string[] = [];
  parts.push(`PROJECT ROOT: ${dirPath}`);
  parts.push(`TEST RUNNER: ${runner}`);
  parts.push('\n=== FILE TREE ===\n' + treeStr);

  if (context.primaryFiles.length > 0) {
    parts.push('\n=== FILE CONTENTS ===');
    for (const f of context.primaryFiles) {
      parts.push(`\n--- ${f.relativePath} ---\n${f.content}`);
    }
  }

  if (context.summarizedFiles.length > 0) {
    parts.push('\n=== FILE SUMMARIES ===');
    for (const f of context.summarizedFiles) {
      parts.push(`\n--- ${f.relativePath} (summary) ---\n${f.summary}`);
    }
  }

  return parts.join('\n');
}

// ─── Build full analysis result (without suggestions — those come from Claude) ─

export async function buildBaseAnalysis(dirPath: string): Promise<Omit<TestsAnalysis, 'suggestions'>> {
  const [runnerInfo, existingTests] = await Promise.all([
    detectTestRunner(dirPath),
    findExistingTests(dirPath),
  ]);

  return {
    runner: runnerInfo.runner,
    runAllCommand: runnerInfo.runAllCommand,
    packageTestScript: runnerInfo.packageTestScript,
    existingTests,
  };
}
