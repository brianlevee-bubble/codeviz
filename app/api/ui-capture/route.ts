export const runtime = 'nodejs';

import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { createHash } from 'crypto';

export async function POST(request: Request) {
  try {
    const { projectPath, routeId, imageBase64 } = await request.json();

    if (!projectPath || !routeId || !imageBase64) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (projectPath.includes('\0') || routeId.includes('\0')) {
      return Response.json({ error: 'Invalid path' }, { status: 400 });
    }

    // Compute same hash as route-scanner
    const projectHash = createHash('md5').update(path.resolve(projectPath)).digest('hex').slice(0, 8);

    const captureDir = path.join(process.cwd(), 'public', 'ui-captures', projectHash);
    await mkdir(captureDir, { recursive: true });

    // Strip data URI prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const filePath = path.join(captureDir, `${routeId}.jpg`);
    await writeFile(filePath, buffer);

    const url = `/ui-captures/${projectHash}/${routeId}.jpg`;
    return Response.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save screenshot';
    return Response.json({ error: message }, { status: 500 });
  }
}
