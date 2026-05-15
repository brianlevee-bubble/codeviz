export const runtime = 'nodejs';

import path from 'path';
import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { buildRunCommand } from '@/lib/test-runner/test-analyzer';
import type { TestRunner } from '@/lib/test-runner/types';

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const {
    projectPath,
    testFile,        // relative path of an existing test or newly created file
    testCode,        // if provided, write this code to testFile first
    runner,
    packageTestScript,
  } = await request.json().catch(() => ({}));

  if (!projectPath || projectPath.includes('\0')) {
    return Response.json({ error: 'Invalid projectPath' }, { status: 400 });
  }

  const resolved = path.resolve(projectPath);

  // Security: all test files must reside within the project
  if (testFile) {
    const absTest = path.resolve(resolved, testFile);
    if (!absTest.startsWith(resolved + path.sep) && absTest !== resolved) {
      return Response.json({ error: 'Test file path escapes project root' }, { status: 400 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        // Write test file if code was provided
        if (testFile && testCode) {
          const absTest = path.resolve(resolved, testFile);
          await mkdir(path.dirname(absTest), { recursive: true });
          await writeFile(absTest, testCode, 'utf-8');
          emit({ type: 'line', text: `✏️  Created ${testFile}` });
        }

        const { cmd, args } = buildRunCommand(
          runner as TestRunner,
          testFile ?? null,
          packageTestScript ?? null
        );

        emit({ type: 'line', text: `▶  ${cmd} ${args.join(' ')}` });
        emit({ type: 'line', text: '' });

        const proc = spawn(cmd, args, {
          cwd: resolved,
          env: { ...process.env, FORCE_COLOR: '0', CI: '1' },
          shell: false,
        });

        // Buffer lines so we don't flood with single-char events
        function handleOutput(chunk: Buffer) {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            emit({ type: 'line', text: line });
          }
        }

        proc.stdout?.on('data', handleOutput);
        proc.stderr?.on('data', handleOutput);

        await new Promise<void>((resolve) => {
          proc.on('close', (code) => {
            emit({ type: 'line', text: '' });
            emit({
              type: 'done',
              exitCode: code ?? 0,
              text: code === 0 ? '✅ Tests passed' : `❌ Tests failed (exit ${code})`,
            });
            resolve();
          });
          proc.on('error', (err) => {
            emit({ type: 'error', text: `Failed to start process: ${err.message}` });
            resolve();
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Run failed';
        emit({ type: 'error', text: message });
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
