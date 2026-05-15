export const runtime = 'nodejs';

import path from 'path';
import { stat } from 'fs/promises';
import type { PendingChange, GraphData } from '@/lib/types';
import { mapChangesToOperations } from '@/lib/editor/operation-mapper';
import { generateCodeChanges } from '@/lib/editor/claude-editor';

export async function POST(request: Request) {
  const body = await request.json() as {
    directoryPath: string;
    changes: PendingChange[];
    graphData: GraphData;
  };

  const { directoryPath, changes, graphData } = body;

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  try {
    const operations = mapChangesToOperations(changes, graphData);
    if (operations.length === 0) {
      return Response.json({ diffs: [] });
    }

    const diffs = await generateCodeChanges(operations, resolved);
    return Response.json({ diffs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate diff';
    return Response.json({ error: message }, { status: 500 });
  }
}
