export const runtime = 'nodejs';

import path from 'path';
import { readFile } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { applyDiffs } from '@/lib/editor/file-writer';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const SKIP_DIRS = ['node_modules', '.git', '.next', 'dist', 'build'];

function validatePath(filePath: string, directoryPath: string): boolean {
  const resolved = path.resolve(directoryPath, filePath);
  if (!resolved.startsWith(path.resolve(directoryPath))) return false;
  for (const skip of SKIP_DIRS) {
    if (resolved.includes(`/${skip}/`) || resolved.includes(`\\${skip}\\`)) return false;
  }
  return true;
}

async function tryRead(absPath: string): Promise<string | null> {
  try { return await readFile(absPath, 'utf-8'); } catch { return null; }
}

export async function POST(request: Request) {
  const body = await request.json() as {
    directoryPath: string;
    sourceFiles: string[];
    instruction: string;
    elementDesc: string;
  };

  const { directoryPath, sourceFiles, instruction, elementDesc } = body;

  if (!directoryPath || directoryPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }
  if (!instruction || !sourceFiles?.length) {
    return Response.json({ error: 'instruction and sourceFiles are required' }, { status: 400 });
  }

  const resolved = path.resolve(directoryPath);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'scanning', message: 'Reading source files…' });

        // Read all source files (only valid, in-bounds paths)
        const fileContents: Array<{ file: string; content: string }> = [];
        for (const rel of sourceFiles.slice(0, 6)) {
          if (!validatePath(rel, resolved)) continue;
          const absPath = path.resolve(resolved, rel);
          const content = await tryRead(absPath);
          if (content) fileContents.push({ file: rel, content: content.slice(0, 12000) });
        }

        if (fileContents.length === 0) {
          emit({ phase: 'error', error: 'No readable source files found' });
          controller.close();
          return;
        }

        emit({ phase: 'generating', message: 'Applying changes…' });

        const filesBlock = fileContents
          .map(({ file, content }) => `### ${file}\n\`\`\`tsx\n${content}\n\`\`\``)
          .join('\n\n');

        const systemPrompt = `You are a code editor. The user is looking at a specific DOM element in their React/Next.js app and wants to change it.

Given the source files and the user's instruction, modify the single most relevant file to implement the change. Be surgical — change only what's needed to fulfill the instruction, preserving all other code exactly as-is.

Return ONLY valid JSON with no markdown fences, no explanation:
{"file":"relative/path/to/file.tsx","content":"full updated file content here"}

Rules:
- Return the COMPLETE updated file content (not a diff or snippet)
- Use relative paths (e.g. "app/page.tsx", not "/Users/...")
- Never modify files in node_modules, .next, dist, build, or .git
- If the instruction is ambiguous, make a reasonable best-guess change`;

        const userMsg = `Selected element:
\`\`\`html
${elementDesc}
\`\`\`

User instruction: ${instruction}

Source files:
${filesBlock}`;

        const message = await client.messages.create({
          model: 'claude-sonnet-4-5',
          max_tokens: 8192,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        });

        const rawText = message.content
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; text: string }).text)
          .join('')
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '');

        const jsonStart = rawText.indexOf('{');
        const jsonEnd = rawText.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error('Claude did not return valid JSON');
        }

        const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1)) as {
          file: string;
          content: string;
        };

        if (!parsed.file || !parsed.content) {
          throw new Error('Response missing file or content fields');
        }

        if (!validatePath(parsed.file, resolved)) {
          throw new Error(`File path rejected: ${parsed.file}`);
        }

        // Find the original content for the diff
        const original = fileContents.find(f => f.file === parsed.file)?.content ?? '';

        // Write via applyDiffs (atomic write with path validation)
        const result = await applyDiffs(
          [{ file: parsed.file, before: original, after: parsed.content }],
          resolved,
          [parsed.file]
        );

        if (result.errors.length > 0) {
          throw new Error(result.errors[0].error);
        }

        emit({ phase: 'complete', file: parsed.file, message: `Applied to ${parsed.file}` });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
