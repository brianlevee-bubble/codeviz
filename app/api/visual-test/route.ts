export const runtime = 'nodejs';

import path from 'path';
import { readFile, access } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function tryRead(filePath: string): Promise<string | null> {
  try { return await readFile(filePath, 'utf-8'); } catch { return null; }
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

async function detectFramework(rootPath: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(path.join(rootPath, 'package.json'), 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['vitest']) return 'vitest';
    if (deps['@playwright/test']) return 'playwright';
    if (deps['jest']) return 'jest';
  } catch { /* ignore */ }
  return 'jest';
}

function suggestTestFilename(sourceFile: string): string {
  const ext = path.extname(sourceFile);
  const base = path.basename(sourceFile, ext);
  const dir = path.dirname(sourceFile);
  // Place test next to source in a __tests__ dir or alongside it
  return path.join(dir, `${base}.test${ext}`);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  const description = searchParams.get('description');
  const sourceFilesParam = searchParams.get('sourceFiles') ?? '';
  const elementInfo = searchParams.get('elementInfo') ?? '';

  if (!dirPath || !description) {
    return Response.json({ error: 'Missing path or description' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);
  const sourceFiles = sourceFilesParam.split(',').filter(Boolean).slice(0, 4);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'scanning', message: 'Reading source files…' });

        const [framework, fileContents] = await Promise.all([
          detectFramework(resolved),
          Promise.all(
            sourceFiles.map(async f => {
              const abs = path.resolve(resolved, f);
              if (!abs.startsWith(resolved)) return null;
              const content = await tryRead(abs);
              return content ? { file: f, content: content.slice(0, 8000) } : null;
            })
          ),
        ]);

        const validFiles = fileContents.filter((f): f is { file: string; content: string } => f !== null);

        // Check for existing test file to match style
        const primaryFile = validFiles[0]?.file;
        let existingTestContent = '';
        if (primaryFile) {
          const testPath = path.resolve(resolved, suggestTestFilename(primaryFile));
          if (await exists(testPath)) {
            existingTestContent = (await tryRead(testPath))?.slice(0, 2000) ?? '';
          }
        }

        const suggestedFilename = primaryFile ? suggestTestFilename(primaryFile) : 'components/__tests__/element.test.tsx';

        emit({ phase: 'analyzing', message: `Generating test with ${framework}…` });

        const filesBlock = validFiles
          .map(({ file, content }) => `### ${file}\n\`\`\`tsx\n${content}\n\`\`\``)
          .join('\n\n');

        const systemPrompt = `You are an expert test engineer. Write a single, complete, runnable test file using ${framework} and React Testing Library.

The test file must:
- Implement EXACTLY the described test case
- Import the component under test using a relative path from the test file location
- Mock fetch/API calls, router, and external deps as needed
- Use describe + it/test blocks with the exact test description provided
- Be immediately runnable — no placeholders, no TODOs
- Return ONLY the raw code — no markdown fences, no explanation`;

        const userMsg = [
          `Test to implement: "${description}"`,
          elementInfo ? `\nElement context: ${elementInfo}` : '',
          `\nSuggested test file path: ${suggestedFilename}`,
          existingTestContent ? `\nExisting test style reference:\n\`\`\`\n${existingTestContent}\n\`\`\`` : '',
          validFiles.length > 0 ? `\n\nSource files:\n${filesBlock}` : '\n\nNo source files found — generate a reasonable test based on the description.',
        ].join('');

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        const clean = fullText.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '').trim();

        emit({ phase: 'complete', output: clean, suggestedFilename, framework });
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
