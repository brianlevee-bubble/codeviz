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

const SYSTEM_PROMPT = `You are a code analyst specializing in data fetching patterns. Analyze the codebase and return ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

The JSON must match this exact schema:
{
  "pages": [
    {
      "id": "string (snake_case, unique, e.g. page_dashboard)",
      "route": "string (URL path, e.g. /dashboard)",
      "file": "string (relative file path)",
      "label": "string (human-readable page name)",
      "lists": [
        {
          "id": "string (snake_case, unique, e.g. list_team_members)",
          "name": "string (e.g. 'Team Members')",
          "description": "string (what this list shows, max 100 chars)",
          "file": "string (file where query lives, relative path)",
          "query": "string (the actual query/fetch code, faithfully copied)",
          "queryType": "prisma|sql|fetch|trpc|supabase|other",
          "tables": ["string (DB model/table names)"],
          "filters": ["string (human-readable filter, e.g. 'current user only')"],
          "sort": "string (optional, e.g. 'createdAt DESC')",
          "limit": number (optional),
          "isPaginated": boolean (optional)
        }
      ]
    }
  ]
}

RULES:
- Only include pages that actually render lists, tables, or grids of data
- For each list, copy the EXACT query code (Prisma call, SQL query, fetch call, etc.)
- Include ALL filters — auth checks, where clauses, role-based conditions
- If a list is empty/has no data fetching, skip it
- Group server actions / helper functions with the page that calls them
- Focus on read queries (SELECT / findMany / findFirst), not mutations
- Include computed/derived lists (e.g. filtered from parent fetch)
- Limit: max 15 pages, max 5 lists per page — focus on the most important
- If multiple pages share the same query (via a shared function), include it on each page`;

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

        emit({ phase: 'chunking', message: 'Selecting relevant files…' });
        const context = await buildChunkedContext(tree, resolved);
        const prompt = buildAnalysisPrompt(context, resolved);

        emit({ phase: 'analyzing', message: 'Extracting list queries…' });

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

        // Parse
        const clean = fullText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        let result = { pages: [] };
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
