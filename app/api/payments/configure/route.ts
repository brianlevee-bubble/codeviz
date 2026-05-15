export const runtime = 'nodejs';

import path from 'path';
import { writeFile, stat } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { walkDirectory } from '@/lib/analyzer/file-reader';
import { buildChunkedContext, buildAnalysisPrompt } from '@/lib/analyzer/chunker';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const body = await request.json();
  const { dirPath, action, providerName, details } = body as {
    dirPath: string;
    action: 'add' | 'add-webhook' | 'add-product' | 'add-flow' | 'configure';
    providerName: string;
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
          'add': `Add the "${providerName}" payment provider to this project. Set up SDK initialization, API routes for checkout/billing, webhook handlers, and environment variables. ${details}`,
          'add-webhook': `Add webhook handler(s) for the "${providerName}" payment provider. ${details}`,
          'add-product': `Add a product/plan configuration for the "${providerName}" payment provider. ${details}`,
          'add-flow': `Add a payment flow (checkout, subscription, refund, etc.) for the "${providerName}" payment provider. ${details}`,
          'configure': `Update the configuration for the "${providerName}" payment provider. ${details}`,
        };

        const systemPrompt = `You are a payment systems expert. Given a codebase and a payment configuration request, return ONLY a valid JSON object describing the file changes needed. No markdown, no code fences, just raw JSON.

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
- For "add": create SDK initialization, checkout/billing API routes, webhook handler, type definitions, and env var config
- For "add-webhook": add webhook endpoint with signature verification and event handling
- For "add-product": add product/price configuration constants or database entries
- For "add-flow": create the full payment flow (route + client-side + redirect handling)
- For "configure": only modify config-related code (keys, modes, settings)
- Always include webhook signature verification for security
- Use TypeScript and follow existing project patterns
- Include proper error handling and type safety
- NEVER include actual secret values — use placeholder comments
- For Stripe: use the stripe npm package with proper TypeScript types
- For PayPal: use @paypal/checkout-server-sdk or REST API
- Always separate server-side (secret key) from client-side (publishable key) concerns`;

        emit({ phase: 'analyzing', message: `Planning ${action} for ${providerName}...` });

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
          emit({ phase: 'error', error: 'Failed to parse configuration plan' });
          return;
        }

        emit({ phase: 'plan', plan });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Configuration failed' });
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
