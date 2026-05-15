export const runtime = 'nodejs';

import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SKIP_DIRS = ['node_modules', '.git', '.next', 'dist', 'build'];

function validatePath(filePath: string, directoryPath: string): boolean {
  const resolved = path.resolve(directoryPath, filePath);
  if (!resolved.startsWith(path.resolve(directoryPath))) return false;
  for (const skip of SKIP_DIRS) {
    if (resolved.includes(`/${skip}/`) || resolved.includes(`\\${skip}\\`)) return false;
  }
  return true;
}

export async function POST(request: Request) {
  const body = await request.json() as {
    directoryPath: string;
    file: string;
    queryCode: string;
    instruction: string;
  };

  const { directoryPath, file, queryCode, instruction } = body;

  if (!directoryPath || directoryPath.includes('\0')) {
    return Response.json({ error: 'Invalid directory path' }, { status: 400 });
  }
  if (!file || !instruction) {
    return Response.json({ error: 'file and instruction are required' }, { status: 400 });
  }
  if (!validatePath(file, directoryPath)) {
    return Response.json({ error: 'File path rejected' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const absPath = path.resolve(directoryPath, file);
  if (!existsSync(absPath)) {
    return Response.json({ error: `File not found: ${file}` }, { status: 404 });
  }

  let fileContent: string;
  try {
    fileContent = await readFile(absPath, 'utf-8');
  } catch (err) {
    return Response.json({ error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }

  const prompt = `You are editing a source file. The user wants to modify a specific query/data fetch.

File path: ${file}
File content:
\`\`\`
${fileContent}
\`\`\`

The specific query to modify:
\`\`\`
${queryCode}
\`\`\`

User instruction: ${instruction}

Apply the instruction to the query above in the context of the full file. Return ONLY the complete updated file content with no markdown fences, no explanation, just the raw file content.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const updatedContent = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()
      // Strip any accidental markdown fences
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '');

    if (!updatedContent) {
      return Response.json({ error: 'Claude returned empty response' }, { status: 500 });
    }

    // Write updated content back to file
    await writeFile(absPath, updatedContent, 'utf-8');

    return Response.json({ success: true, updatedContent });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to edit query';
    return Response.json({ error: message }, { status: 500 });
  }
}
