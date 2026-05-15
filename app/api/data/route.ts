export const runtime = 'nodejs';

import path from 'path';
import { getDatabaseInfo, getTableData } from '@/lib/schema/db-reader';
import { findFilesByExtension } from '@/lib/schema/file-finder';

async function findDbFile(dirPath: string): Promise<string | null> {
  const files = await findFilesByExtension(dirPath, ['.db', '.sqlite', '.sqlite3'], 4);
  // Filter out node_modules etc (already done in finder), prefer prisma/dev.db
  const preferred = files.find((f) => f.includes('prisma'));
  return preferred ?? files[0] ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  const table = searchParams.get('table');
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  if (!dirPath || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);
  const dbFile = await findDbFile(resolved);

  if (!dbFile) {
    return Response.json(
      { error: 'No SQLite database found in this project' },
      { status: 404 }
    );
  }

  try {
    if (table) {
      const data = getTableData(dbFile, table, page);
      return Response.json({ data, dbFile: dbFile.replace(resolved + '/', '') });
    } else {
      const info = getDatabaseInfo(dbFile);
      return Response.json({ info, dbFile: dbFile.replace(resolved + '/', '') });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read database';
    return Response.json({ error: message }, { status: 500 });
  }
}
