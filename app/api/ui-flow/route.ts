export const runtime = 'nodejs';

import path from 'path';
import { scanUIFlow } from '@/lib/ui-flow/route-scanner';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

  if (!dirPath || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);

  const hostHeader = request.headers.get('host') ?? '';
  const currentPort = parseInt(hostHeader.split(':')[1] ?? '3000', 10);

  try {
    const graph = await scanUIFlow(resolved, currentPort);
    return Response.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to scan UI flow';
    return Response.json({ error: message }, { status: 500 });
  }
}
