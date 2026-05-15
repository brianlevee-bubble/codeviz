import { writeFile, rename, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { FileDiff } from '@/lib/types';

const SKIP_DIRS = ['node_modules', '.git', '.next', 'dist', 'build'];

function validatePath(filePath: string, directoryPath: string): boolean {
  const resolved = path.resolve(directoryPath, filePath);
  if (!resolved.startsWith(path.resolve(directoryPath))) return false;
  for (const skip of SKIP_DIRS) {
    if (resolved.includes(`/${skip}/`) || resolved.includes(`\\${skip}\\`)) return false;
  }
  return true;
}

export async function applyDiffs(
  diffs: FileDiff[],
  directoryPath: string,
  approvedFiles: string[]
): Promise<{ success: string[]; errors: Array<{ file: string; error: string }> }> {
  const approvedSet = new Set(approvedFiles);
  const success: string[] = [];
  const errors: Array<{ file: string; error: string }> = [];

  for (const diff of diffs) {
    if (!approvedSet.has(diff.file)) continue;

    if (!validatePath(diff.file, directoryPath)) {
      errors.push({ file: diff.file, error: 'Path rejected by security check' });
      continue;
    }

    const absPath = path.resolve(directoryPath, diff.file);

    try {
      if (diff.after === '') {
        // Delete
        if (existsSync(absPath)) {
          await unlink(absPath);
        }
        success.push(diff.file);
        continue;
      }

      // Ensure parent directory exists
      const parentDir = path.dirname(absPath);
      await mkdir(parentDir, { recursive: true });

      // Write to temp file first, then rename (atomic)
      const tmpPath = absPath + '.codeviz.tmp';
      await writeFile(tmpPath, diff.after, 'utf-8');
      await rename(tmpPath, absPath);

      success.push(diff.file);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ file: diff.file, error: message });

      // Clean up temp file if it exists
      const tmpPath = absPath + '.codeviz.tmp';
      try {
        if (existsSync(tmpPath)) await unlink(tmpPath);
      } catch {}
    }
  }

  return { success, errors };
}
