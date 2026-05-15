export const runtime = 'nodejs';

import path from 'path';
import { stat } from 'fs/promises';
import type { FileDiff } from '@/lib/types';
import { applyDiffs } from '@/lib/editor/file-writer';

export async function POST(request: Request) {
  const body = await request.json() as {
    directoryPath: string;
    diffs: FileDiff[];
    approvedFiles: string[];
  };

  const { directoryPath, diffs, approvedFiles } = body;

  if (!directoryPath || directoryPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(directoryPath);
  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) throw new Error('Not a directory');
  } catch {
    return Response.json({ error: 'Directory not found' }, { status: 404 });
  }

  try {
    const result = await applyDiffs(diffs, resolved, approvedFiles);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to apply changes';
    return Response.json({ error: message }, { status: 500 });
  }
}
