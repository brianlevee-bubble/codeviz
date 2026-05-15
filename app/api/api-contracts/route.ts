export const runtime = 'nodejs';

import path from 'path';
import { stat, readFile } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { walkDirectory, flattenTree } from '@/lib/analyzer/file-reader';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const SYSTEM_PROMPT = `You are an API documentation analyst. Analyze ONLY the API route files provided and return ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

For each exported HTTP handler (GET, POST, PUT, PATCH, DELETE), extract:
- The URL path from the file path (e.g. app/api/users/[id]/route.ts → /api/users/[id])
- The HTTP method from the exported function name
- Request body shape: look for Zod schemas, TypeScript interfaces, request.json() usage
- Response body shape: look for Response.json({...}) calls and return types
- Auth mechanism: look for getServerSession(), auth(), verifyToken(), Authorization header checks, middleware references
- Required roles: look for role checks, permission guards

Return this exact schema:
{
  "endpoints": [
    {
      "id": "string (snake_case unique, e.g. get_users_id)",
      "method": "GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS",
      "path": "string (URL path, e.g. /api/users/[id])",
      "file": "string (relative file path)",
      "category": "string (first meaningful segment after /api/, e.g. users, auth, products)",
      "summary": "string (one sentence what this endpoint does, max 80 chars)",
      "auth": "none|session|jwt|api_key|oauth|basic|unknown",
      "requiredRoles": ["string"],
      "requestBody": {
        "contentType": "application/json",
        "schema": "string (TypeScript-like type description, e.g. { userId: string; name: string })"
      },
      "responseBody": {
        "statusCode": 200,
        "schema": "string (TypeScript-like type description)"
      },
      "params": [
        {
          "name": "string",
          "location": "path|query|body|header",
          "type": "string",
          "required": true,
          "description": "string (optional)"
        }
      ],
      "codeSnippet": "string (3-6 most important lines showing the core logic, optional)"
    }
  ],
  "categories": ["string (sorted unique category names)"],
  "stats": {
    "totalEndpoints": 0,
    "byMethod": { "GET": 0, "POST": 0 },
    "publicCount": 0,
    "protectedCount": 0
  }
}

RULES:
- Only analyze API route files (app/api/** and pages/api/**)
- If no request body is needed (GET), omit requestBody
- If auth is 'none', mark it as public (publicCount)
- Be specific about request/response shapes — show actual field names and types
- codeSnippet: pick the 3-6 lines that best show what the endpoint does
- max 50 endpoints total`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

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
        emit({ phase: 'reading', message: 'Finding API routes…' });

        const tree = await walkDirectory(resolved);
        const allFiles = flattenTree(tree).filter(f => f.type === 'file');

        // Pre-filter to only API route files and middleware
        const apiFiles = allFiles.filter(f => {
          const rel = path.relative(resolved, f.path);
          return (
            rel.match(/^(src\/)?app\/api\//i) ||
            rel.match(/^(src\/)?pages\/api\//i) ||
            rel.match(/^middleware\.(ts|js|tsx|jsx)$/i)
          );
        });

        if (apiFiles.length === 0) {
          emit({ phase: 'complete', graph: { endpoints: [], categories: [], stats: { totalEndpoints: 0, byMethod: {}, publicCount: 0, protectedCount: 0 } } });
          return;
        }

        emit({ phase: 'analyzing', message: `Analyzing ${apiFiles.length} API route files…` });

        // Build context with just the API files
        const fileParts: string[] = [];
        for (const file of apiFiles) {
          const rel = path.relative(resolved, file.path);
          try {
            const content = await readFile(file.path, 'utf-8');
            fileParts.push(`### ${rel}\n\`\`\`\n${content.slice(0, 8000)}\n\`\`\``);
          } catch { /* skip unreadable files */ }
        }

        const prompt = `Analyze these API route files from the project at: ${resolved}\n\n${fileParts.join('\n\n')}`;

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 12000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        const clean = fullText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        let result = { endpoints: [], categories: [], stats: { totalEndpoints: 0, byMethod: {}, publicCount: 0, protectedCount: 0 } };
        try {
          result = JSON.parse(clean);
        } catch {
          emit({ phase: 'error', error: 'Failed to parse Claude response' });
          return;
        }

        emit({ phase: 'complete', graph: result });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Analysis failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
