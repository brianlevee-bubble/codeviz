export const runtime = 'nodejs';

import { stat } from 'fs/promises';
import { walkDirectory } from '@/lib/analyzer/file-reader';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

  if (!dirPath) {
    return Response.json({ error: 'path parameter required' }, { status: 400 });
  }

  // Basic path security: reject obvious traversal attempts
  if (dirPath.includes('..') || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const stats = await stat(dirPath);
    if (!stats.isDirectory()) {
      return Response.json({ error: 'Path is not a directory' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Path does not exist or is not accessible' }, { status: 404 });
  }

  try {
    const tree = await walkDirectory(dirPath, { maxDepth: 3, contentThreshold: 0 });
    return Response.json({ tree, path: dirPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}
