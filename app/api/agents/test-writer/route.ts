export const runtime = 'nodejs';

import path from 'path';
import { stat, readFile } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function detectFramework(rootPath: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(path.join(rootPath, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['vitest']) return 'vitest';
    if (deps['@playwright/test']) return 'playwright';
    if (deps['jest']) return 'jest';
  } catch { /* ignore */ }
  return 'vitest'; // sensible default for Next.js projects
}

function suggestTestFilename(filePath: string): string {
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  return path.join(dir, `${base}.test${ext}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  const file = searchParams.get('file');

  if (!dirPath || !file) {
    return Response.json({ error: 'Missing path or file parameter' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);
  const filePath = path.resolve(resolved, file);

  if (!filePath.startsWith(resolved)) {
    return Response.json({ error: 'Path traversal not allowed' }, { status: 400 });
  }

  try {
    await stat(resolved);
    await stat(filePath);
  } catch {
    return Response.json({ error: 'Path not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'scanning', message: 'Reading source file…' });

        const [sourceContent, framework] = await Promise.all([
          readFile(filePath, 'utf-8'),
          detectFramework(resolved),
        ]);

        // Try to read an adjacent existing test file for style reference
        const testFilePath = path.resolve(resolved, suggestTestFilename(file));
        let existingTestContent = '';
        try {
          existingTestContent = await readFile(testFilePath, 'utf-8');
        } catch { /* no existing test */ }

        const relFile = path.relative(resolved, filePath);
        const suggestedFilename = suggestTestFilename(file);

        emit({ phase: 'analyzing', message: `Writing tests with ${framework}…` });

        const systemPrompt = `You are an expert test engineer specializing in ${framework}.
Write a complete, runnable test file for the given source file.
- Include meaningful test cases covering the happy path, edge cases, and error conditions
- Mock external dependencies (API calls, database, timers) appropriately
- Use describe/it blocks with clear, descriptive test names
- Add setup/teardown (beforeEach/afterEach) where needed
- Import from the source file using relative paths
- Return ONLY the test file code — no explanation, no markdown fences, just the raw code`;

        const userMessage = `Source file: ${relFile}

\`\`\`${relFile.endsWith('.tsx') || relFile.endsWith('.jsx') ? 'tsx' : 'ts'}
${sourceContent.slice(0, 12000)}
\`\`\`
${existingTestContent ? `\nExisting test file style reference:\n\`\`\`\n${existingTestContent.slice(0, 3000)}\n\`\`\`` : ''}

Write the complete test file.`;

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 8000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        // Strip markdown fences if Claude added them
        const clean = fullText.replace(/^```(?:\w+)?\n?/m, '').replace(/\n?```$/m, '').trim();

        emit({
          phase: 'complete',
          output: clean,
          suggestedFilename,
          framework,
        });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
