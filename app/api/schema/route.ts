export const runtime = 'nodejs';

import { readFile } from 'fs/promises';
import path from 'path';
import { parsePrismaSchema } from '@/lib/schema/prisma-parser';
import { firstExisting, findFilesByExtension } from '@/lib/schema/file-finder';
import type { ParsedSchema } from '@/lib/schema/types';

async function findSchemaFile(
  dirPath: string
): Promise<{ file: string; type: 'prisma' | 'sql' } | null> {
  // Check known Prisma locations first
  const prismaFile = await firstExisting([
    path.join(dirPath, 'prisma', 'schema.prisma'),
    path.join(dirPath, 'schema.prisma'),
    path.join(dirPath, 'db', 'schema.prisma'),
  ]);
  if (prismaFile) return { file: prismaFile, type: 'prisma' };

  // Fallback: look for any .sql file
  const sqlFiles = await findFilesByExtension(dirPath, ['.sql'], 4);
  if (sqlFiles.length > 0) return { file: sqlFiles[0], type: 'sql' };

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

  if (!dirPath || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);
  const schemaInfo = await findSchemaFile(resolved);

  if (!schemaInfo) {
    return Response.json(
      { error: 'No schema file found (looked for prisma/schema.prisma and .sql files)' },
      { status: 404 }
    );
  }

  const content = await readFile(schemaInfo.file, 'utf-8');

  let schema: ParsedSchema;
  if (schemaInfo.type === 'prisma') {
    schema = parsePrismaSchema(content);
    schema.schemaFile = schemaInfo.file.replace(resolved + '/', '');
  } else {
    schema = {
      models: [],
      relations: [],
      source: 'sql',
      schemaFile: schemaInfo.file.replace(resolved + '/', ''),
    };
  }

  return Response.json({ schema });
}
