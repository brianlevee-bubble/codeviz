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

async function readTruncated(absPath: string, maxChars = 4000): Promise<string> {
  const content = await readFile(absPath, 'utf-8').catch(() => '');
  return content.length > maxChars ? content.slice(0, maxChars) + '\n// ... (truncated)' : content;
}

async function traceImports(startFile: string, cwd: string, depth = 2): Promise<string[]> {
  const visited = new Set<string>([startFile]);
  const queue = [startFile];

  for (let d = 0; d < depth && queue.length > 0; d++) {
    const next: string[] = [];
    for (const f of queue) {
      const abs = path.join(cwd, f);
      const content = await readFile(abs, 'utf-8').catch(() => '');
      const importMatches = content.matchAll(/from ['"](@\/[^'"]+|\.{1,2}\/[^'"]+)['"]/g);
      for (const m of importMatches) {
        let imp = m[1].replace(/^@\//, 'src/').replace(/^@\//, '');
        if (imp.startsWith('@/')) imp = imp.slice(2);
        // Try common extensions
        for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx', '']) {
          const candidate = imp.endsWith('.ts') || imp.endsWith('.tsx') ? imp : imp + ext;
          if (candidate && !visited.has(candidate)) {
            try {
              await readFile(path.join(cwd, candidate), 'utf-8');
              visited.add(candidate);
              next.push(candidate);
              break;
            } catch { /* skip */ }
          }
        }
      }
    }
    queue.length = 0;
    queue.push(...next.slice(0, 6));
  }

  return [...visited].slice(0, 10);
}

async function findRelatedFiles(actionFile: string, actionLabel: string, cwd: string): Promise<string[]> {
  const files = new Set<string>([actionFile]);

  // Grep for the action function/handler name as a keyword
  const keyword = actionLabel.replace(/\s+/g, '').toLowerCase();
  const patterns = [keyword, 'db.', 'prisma.', 'supabase.', 'fetch(', 'axios.'];

  for (const p of patterns) {
    try {
      const { stdout } = await execAsync(
        `grep -rl ${INCLUDE} "${p}" . 2>/dev/null | ${EXCLUDE} | head -6`,
        { cwd, timeout: 5000 }
      );
      for (const f of stdout.trim().split('\n').filter(Boolean)) {
        files.add(f.replace(/^\.\//, ''));
      }
    } catch { /* ignore */ }
  }

  // Always include API routes and server actions
  try {
    const { stdout } = await execAsync(
      `grep -rl ${INCLUDE} '"use server"' . 2>/dev/null | ${EXCLUDE} | head -4`,
      { cwd, timeout: 5000 }
    );
    for (const f of stdout.trim().split('\n').filter(Boolean)) {
      files.add(f.replace(/^\.\//, ''));
    }
  } catch { /* ignore */ }

  // Trace imports from action file
  const imported = await traceImports(actionFile, cwd, 2);
  for (const f of imported) files.add(f);

  return [...files].slice(0, 12);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  const actionFile = searchParams.get('file');
  const actionLabel = searchParams.get('label') ?? 'action';
  const actionDescription = searchParams.get('description') ?? '';

  if (!dirPath || !actionFile) return new Response('Missing params', { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: unknown) => controller.enqueue(enc.encode(sse(data)));

      try {
        send({ phase: 'scanning' });

        const relatedFiles = await findRelatedFiles(actionFile, actionLabel, dirPath);

        send({ phase: 'reading', count: relatedFiles.length });

        const snippets = await Promise.all(
          relatedFiles.map(async (f) => {
            const abs = path.join(dirPath, f);
            const content = await readTruncated(abs);
            return `=== ${f} ===\n${content}`;
          })
        );

        send({ phase: 'tracing' });

        const systemPrompt = `You are tracing the complete data flow for a specific user action in a Next.js / React codebase.

Given source files, produce a step-by-step data flow graph for the action: "${actionLabel}".
${actionDescription ? `Context: ${actionDescription}` : ''}

Return a JSON object with an array of "nodes". Each node represents one distinct step in the flow.

Node shape:
{
  "id": "unique_snake_case_id",
  "type": "userAction" | "apiCall" | "serverAction" | "validation" | "database" | "response" | "stateUpdate" | "display",
  "label": "Short label",
  "description": "One sentence explaining what happens at this step",
  "code": "2-4 line representative code snippet (actual code from the files if possible)",
  "file": "relative/path/to/file.ts",
  "nextId": "id_of_next_node_or_null"
}

Rules:
- Start with the user action trigger (type: "userAction")
- End with the UI update that the user sees (type: "display")
- Include ALL intermediate steps: API call, server-side handler, validation, DB operation, response, state update
- Use ACTUAL code from the files, not invented examples
- Keep the chain linear (nextId links them in sequence)
- 4–8 nodes total

Return JSON: { "nodes": [...] }`;

        const userPrompt = `Trace the data flow for "${actionLabel}".\n\nSource files:\n\n${snippets.join('\n\n---\n\n')}`;

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });

        const raw = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          send({ phase: 'error', error: 'Could not parse flow trace' });
          controller.close();
          return;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        send({ phase: 'complete', nodes: parsed.nodes ?? [] });
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
