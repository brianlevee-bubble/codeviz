export const runtime = 'nodejs';

import path from 'path';
import { stat } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { buildBaseAnalysis, buildTestContext } from '@/lib/test-runner/test-analyzer';
import type { TestSuggestion } from '@/lib/test-runner/types';

const client = new Anthropic();

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const SYSTEM_PROMPT = `You are a test engineer. Analyze the provided codebase and return ONLY a valid JSON array of test suggestions — no markdown, no code fences, just raw JSON.

The array must contain objects with this exact schema:
{
  "id": "string (snake_case unique, e.g. test_user_login)",
  "title": "string (short descriptive name, max 60 chars)",
  "description": "string (what this test verifies, max 120 chars)",
  "file": "string (suggested relative file path, e.g. __tests__/api/auth.test.ts)",
  "code": "string (complete, runnable test code including imports and describe/it blocks)",
  "category": "unit|component|api|integration|e2e",
  "targetFile": "string (the source file this tests, relative path, optional)",
  "priority": "high|medium|low"
}

RULES:
- Return 8-15 suggestions covering different parts of the app
- Prioritize: auth flows, API endpoints, critical business logic, UI interactions
- Use the detected test runner's syntax (jest/vitest use similar syntax; playwright uses its own)
- Write real, runnable test code — not pseudo-code
- For vitest/jest: use describe/it/expect syntax with vi.mock or jest.mock where needed
- For playwright: use test/expect from @playwright/test
- Mark as "high" priority: auth, data mutations, payment flows
- Mark as "medium" priority: CRUD operations, form validation, navigation
- Mark as "low" priority: display components, static pages, utility functions
- Keep code samples complete but concise (max ~40 lines per test file)`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

  if (!dirPath || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);

  try {
    const s = await stat(resolved);
    if (!s.isDirectory()) {
      return Response.json({ error: 'Path is not a directory' }, { status: 400 });
    }
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
        emit({ phase: 'scanning', message: 'Scanning existing tests...' });

        const base = await buildBaseAnalysis(resolved);
        emit({ phase: 'base', data: base });

        emit({ phase: 'analyzing', message: 'Asking Claude to suggest tests...' });

        const context = await buildTestContext(resolved, base.runner);

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 12000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: context }],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        // Parse suggestions
        const clean = fullText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        let suggestions: TestSuggestion[] = [];
        try {
          const parsed = JSON.parse(clean);
          suggestions = Array.isArray(parsed) ? parsed : parsed.suggestions ?? [];
        } catch {
          suggestions = [];
        }

        emit({ phase: 'complete', suggestions });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to analyze tests';
        emit({ phase: 'error', error: message });
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
