import { readdir, stat } from 'fs/promises';
import path from 'path';

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', '.claude']);

/** Recursively find files matching any of the given extensions, up to maxDepth. */
export async function findFilesByExtension(
  dir: string,
  extensions: string[],
  maxDepth = 5
): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string, depth: number) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) results.push(full);
      }
    }
  }

  await walk(dir, 0);
  return results;
}

/** Check a list of candidate paths and return the first that exists. */
export async function firstExisting(candidates: string[]): Promise<string | null> {
  for (const p of candidates) {
    try {
      await stat(p);
      return p;
    } catch {}
  }
  return null;
}
