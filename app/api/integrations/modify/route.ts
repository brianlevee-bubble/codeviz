export const runtime = 'nodejs';

import path from 'path';
import { readFile, writeFile, stat } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { walkDirectory } from '@/lib/analyzer/file-reader';
import { buildChunkedContext, buildAnalysisPrompt } from '@/lib/analyzer/chunker';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { dirPath, action, integrationName, details } = body as {
    dirPath: string;
    action: 'add' | 'remove' | 'update-config' | 'add-endpoint';
    integrationName: string;
    details: string;
  };

  if (!dirPath || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);

  try {
    const s = await stat(resolved);
    if (!s.isDirectory()) return Response.json({ error: 'Not a directory' }, { status: 400 });
  } catch {
    return Response.json({ error: 'Directory not found' }, { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'reading', message: 'Reading codebase...' });
        const tree = await walkDirectory(resolved);
        const context = await buildChunkedContext(tree, resolved);
        const prompt = buildAnalysisPrompt(context, resolved);

        const actionDescriptions: Record<string, string> = {
          'add': `Add the "${integrationName}" integration to this project. ${details}`,
          'remove': `Remove the "${integrationName}" integration from this project. Remove imports, SDK initialization, API routes, and config keys. ${details}`,
          'update-config': `Update the configuration for the "${integrationName}" integration. ${details}`,
          'add-endpoint': `Add a new endpoint/method using the "${integrationName}" integration. ${details}`,
        };

        const systemPrompt = `You are a code modification assistant. Given a codebase and an integration change request, return ONLY a valid JSON object describing the file changes needed. No markdown, no code fences, just raw JSON.

The JSON must match this schema:
{
  "changes": [
    {
      "file": "string (relative file path)",
      "action": "create|modify|delete",
      "description": "string (what this change does)",
      "content": "string (full file content for create, or the modified content for modify, or empty for delete)"
    }
  ],
  "packagesToInstall": ["string (npm packages to install, e.g. 'stripe@latest')"],
  "envVars": [
    {
      "key": "string",
      "description": "string",
      "example": "string (example value, never real secrets)"
    }
  ],
  "summary": "string (human-readable summary of changes)"
}

RULES:
- For "add": create initialization file, add env vars, create a basic API route or utility
- For "remove": identify and list all files to modify/delete
- For "update-config": only modify config-related code
- For "add-endpoint": add a new API route or SDK call
- Keep changes minimal and focused
- Follow existing project patterns and conventions
- Use TypeScript and the project's coding style
- NEVER include actual secret values`;

        emit({ phase: 'analyzing', message: `Planning ${action} for ${integrationName}...` });

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 16000,
          system: systemPrompt,
          messages: [
            { role: 'user', content: `${prompt}\n\n---\nACTION REQUESTED:\n${actionDescriptions[action]}` },
          ],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        const clean = fullText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        let plan;
        try {
          plan = JSON.parse(clean);
        } catch {
          emit({ phase: 'error', error: 'Failed to parse modification plan' });
          return;
        }

        emit({ phase: 'plan', plan });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Modification failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { dirPath, changes } = body as {
    dirPath: string;
    changes: Array<{
      file: string;
      action: 'create' | 'modify' | 'delete';
      content: string;
    }>;
  };

  if (!dirPath || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);
  const results: Array<{ file: string; status: 'ok' | 'error'; error?: string }> = [];

  for (const change of changes) {
    const filePath = path.resolve(resolved, change.file);
    if (!filePath.startsWith(resolved)) {
      results.push({ file: change.file, status: 'error', error: 'Path traversal blocked' });
      continue;
    }

    try {
      if (change.action === 'delete') {
        const { unlink } = await import('fs/promises');
        await unlink(filePath);
      } else {
        const dir = path.dirname(filePath);
        const { mkdir } = await import('fs/promises');
        await mkdir(dir, { recursive: true });
        await writeFile(filePath, change.content, 'utf-8');
      }
      results.push({ file: change.file, status: 'ok' });
    } catch (err) {
      results.push({ file: change.file, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return Response.json({ results });
}
