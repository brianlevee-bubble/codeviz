export const runtime = 'nodejs';

import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);
const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const EXCLUDE = "grep -v node_modules | grep -v .next | grep -v dist | grep -v '.test.' | grep -v '.spec.' | grep -v '.d.ts'";
const INCLUDE = '--include="*.ts" --include="*.tsx"';

async function findActionFiles(cwd: string): Promise<string[]> {
  const patterns = [
    'onClick',
    'onSubmit',
    '"use server"',
    'handleSubmit|handleClick|handleCreate|handleUpdate|handleDelete|handleSave',
    'formAction|action=',
  ];

  const fileSet = new Set<string>();

  for (const p of patterns) {
    try {
      const { stdout } = await execAsync(
        `grep -rl ${INCLUDE} "${p}" . 2>/dev/null | ${EXCLUDE} | head -12`,
        { cwd, timeout: 6000 }
      );
      for (const f of stdout.trim().split('\n').filter(Boolean)) {
        fileSet.add(f.replace(/^\.\//, ''));
      }
    } catch { /* ignore */ }
  }

  return [...fileSet].slice(0, 16);
}

async function readTruncated(absPath: string, maxChars = 3000): Promise<string> {
  const content = await readFile(absPath, 'utf-8').catch(() => '');
  return content.length > maxChars ? content.slice(0, maxChars) + '\n// ... (truncated)' : content;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  if (!dirPath) return new Response('Missing path', { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown) => controller.enqueue(enc.encode(sse(data)));

      try {
        send({ phase: 'scanning' });

        const files = await findActionFiles(dirPath);

        if (files.length === 0) {
          send({ phase: 'complete', actions: [] });
          controller.close();
          return;
        }

        send({ phase: 'reading', count: files.length });

        const snippets = await Promise.all(
          files.map(async (f) => {
            const abs = path.join(dirPath, f);
            const content = await readTruncated(abs);
            return `=== ${f} ===\n${content}`;
          })
        );

        send({ phase: 'analyzing' });

        const systemPrompt = `You are analyzing a Next.js / React codebase to find meaningful user-triggered actions.

Extract a list of distinct user actions — things a user can DO in the app: clicking a button, submitting a form, triggering a mutation, etc.

For each action return:
- id: snake_case unique identifier
- label: short human-readable name (e.g. "Create Task", "Delete Post", "Sign In")
- description: one sentence describing what the user does and what it causes
- trigger: the event type ("onClick" | "onSubmit" | "server action" | "form action" | "other")
- file: the relative file path where this action is defined

Only include actions that have a meaningful data flow (involve an API call, server action, database operation, or state change). Skip purely visual/UI-only interactions.

Return JSON: { "actions": [...] }`;

        const userPrompt = `Here are the relevant source files:\n\n${snippets.join('\n\n---\n\n')}`;

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const raw = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          send({ phase: 'complete', actions: [] });
          controller.close();
          return;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        send({ phase: 'complete', actions: parsed.actions ?? [] });
      } catch (err) {
        send({ phase: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
      }

      controller.close();
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
