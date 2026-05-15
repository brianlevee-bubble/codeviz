export const runtime = 'nodejs';

import path from 'path';
import { readdir, stat } from 'fs/promises';
import { homedir } from 'os';

export interface BrowseEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  hasChildren: boolean; // whether this dir has any subdirectories
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
  /** Quick-access roots shown at the top */
  roots?: { name: string; path: string }[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPath = searchParams.get('path');

  // Default to home directory
  const targetPath = rawPath ? path.resolve(rawPath) : homedir();

  try {
    const s = await stat(targetPath);
    if (!s.isDirectory()) {
      return Response.json({ error: 'Not a directory' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Path not found' }, { status: 404 });
  }

  let dirNames: string[] = [];
  try {
    const raw = await readdir(targetPath, { withFileTypes: true });
    dirNames = raw
      .filter(d => d.isDirectory())
      .map(d => String(d.name));
  } catch {
    return Response.json({ error: 'Cannot read directory (permission denied)' }, { status: 403 });
  }

  const entries: BrowseEntry[] = [];

  for (const name of dirNames) {
    if (name.startsWith('.')) continue;       // skip hidden
    if (name === 'node_modules') continue;
    if (name === '__pycache__') continue;

    const fullPath = path.join(targetPath, name);

    // Peek whether it has any subdirectories (for chevron hint)
    let hasChildren = false;
    try {
      const children = await readdir(fullPath, { withFileTypes: true });
      hasChildren = children.some(c => c.isDirectory() && String(c.name)[0] !== '.' && c.name !== 'node_modules');
    } catch { /* ignore permission errors */ }

    entries.push({
      name,
      path: fullPath,
      isDirectory: true,
      hasChildren,
    });
  }

  // Sort: folders first alphabetically
  entries.sort((a, b) => a.name.localeCompare(b.name));

  // Compute parent
  const parent = targetPath === path.parse(targetPath).root ? null : path.dirname(targetPath);

  // Quick access roots (only at top-level response)
  const roots = !rawPath ? undefined : [
    { name: '🏠 Home', path: homedir() },
    { name: '💻 Users', path: '/Users' },
    { name: '/', path: '/' },
  ];

  return Response.json({ path: targetPath, parent, entries, roots } satisfies BrowseResult);
}
