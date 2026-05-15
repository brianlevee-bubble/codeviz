export const runtime = 'nodejs';

import path from 'path';
import { stat } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { buildChunkedContext, buildAnalysisPrompt } from '@/lib/analyzer/chunker';
import { walkDirectory } from '@/lib/analyzer/file-reader';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const SYSTEM_PROMPT = `You are a senior software architect performing a comprehensive code review. Analyze the codebase across every dimension and return ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

Look at the codebase the same way each of these specialized analysis tabs would:
- **Architecture tab**: coupling, separation of concerns, modularity
- **Data Flow tab**: data mutations, prop drilling, state management
- **Security tab**: auth gaps, missing input validation, exposed secrets, field leaks
- **List Queries tab**: N+1 queries, missing indexes, unfiltered fetches, no pagination
- **DB Schema tab**: missing relations, nullable fields that shouldn't be, no soft deletes
- **Tests tab**: untested critical paths, missing edge cases, no integration tests
- **UI Flow tab**: dead-end pages, missing loading/error states, broken navigation
- **Preview tab**: accessibility, mobile responsiveness, missing feedback

Return this exact schema:
{
  "summary": "string (2–3 sentence overall assessment of the app's health)",
  "improvements": [
    {
      "id": "string (snake_case unique, e.g. imp_add_rate_limiting)",
      "title": "string (max 60 chars, action-oriented, e.g. 'Add rate limiting to auth endpoints')",
      "description": "string (what the problem is and why it matters, max 150 chars)",
      "category": "security|performance|architecture|testing|ux|data|reliability|accessibility|dx",
      "priority": "critical|high|medium|low",
      "effort": "small|medium|large",
      "sourceTab": "string (which analysis dimension found this: Security, Queries, Tests, Architecture, etc.)",
      "files": ["string (relative file paths affected)"],
      "currentPattern": "string (what the current problematic code/pattern looks like, optional)",
      "suggestedChange": "string (concrete description of what to do, max 150 chars)",
      "codeExample": "string (a short before→after or just 'after' code snippet, optional)",
      "tags": ["string (e.g. prisma, nextjs, auth, performance)"]
    }
  ],
  "quickWinIds": ["string (ids of improvements that are small effort AND critical/high priority)"]
}

RULES:
- Return 15–25 improvements spanning multiple categories
- Be specific: reference actual files, function names, and patterns found in the code
- Order improvements within each priority group by impact
- "critical" = security hole, data loss risk, or broken core feature
- "high" = significant user-facing or reliability issue
- "medium" = technical debt, missing best practice
- "low" = nice-to-have polish
- "small" effort = under 30 min, "medium" = hours, "large" = days
- codeExample: show the FIX (what to write), not just the problem. Keep it under 8 lines.
- Cross-cutting improvements that touch multiple tabs are especially valuable
- Be honest — if the app is well-written in an area, skip it; focus on real issues`;

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
        emit({ phase: 'reading', message: 'Reading codebase…' });
        const tree = await walkDirectory(resolved);

        emit({ phase: 'chunking', message: 'Building context…' });
        const context = await buildChunkedContext(tree, resolved);
        const prompt = buildAnalysisPrompt(context, resolved);

        emit({ phase: 'analyzing', message: 'Synthesizing improvements across all dimensions…' });

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 14000,
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
        let result = { summary: '', improvements: [], quickWinIds: [] };
        try {
          result = JSON.parse(clean);
        } catch {
          emit({ phase: 'error', error: 'Failed to parse response — try re-running' });
          return;
        }

        emit({ phase: 'complete', report: result });
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
