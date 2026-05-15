export const runtime = 'nodejs';

import path from 'path';
import { stat } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { buildBaseAnalysis, buildTestContext } from '@/lib/test-runner/test-analyzer';
import type { AppFeature } from '@/lib/features/types';

const client = new Anthropic();

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const SYSTEM_PROMPT = `You are a product manager analyzing a web application codebase. Your job is to think like an end user and product owner — not a developer.

Produce two lists:
1. Features the app ALREADY HAS — described in plain language users would understand
2. Features the app is MISSING that would make it significantly more valuable to users

Return ONLY a valid JSON array — no markdown, no code fences, just raw JSON.

Each element must follow this exact schema:
{
  "id": "string (snake_case unique, e.g. user_notifications)",
  "name": "string (user-friendly feature name, max 40 chars, e.g. 'Email Notifications', 'Team Workspaces', 'Dark Mode')",
  "tagline": "string (one punchy line of user value, max 80 chars, e.g. 'Stay informed without checking the app constantly')",
  "description": "string (2-3 sentences describing what users can do, written for a non-technical audience, max 200 chars)",
  "status": "existing|suggested",
  "category": "authentication|notifications|search|payments|analytics|collaboration|content|productivity|onboarding|settings|integrations|other",
  "impact": "high|medium|low",
  "effort": "small|medium|large",
  "whyItMatters": "string (1-2 sentences on the user or business value — why real users want this, max 150 chars)",
  "gaps": "string (for existing features only: notable limitations or missing pieces users would notice, omit if none, max 120 chars)"
}

RULES:
- Identify 5–8 EXISTING features the app already has, framed from a user perspective
- Suggest 5–8 MISSING features that would genuinely improve user experience based on what the app does
- Use plain language — avoid technical jargon like "API", "SSR", "middleware", "CRUD"
- Feature names should be things a user would search for in a product changelog ("Dark Mode", "CSV Export", "Two-Factor Authentication")
- impact: high=affects most users daily, medium=valuable for many users, low=nice to have for some users
- effort: small=days, medium=weeks, large=months (rough implementation complexity)
- For suggested features: pick things that complement what's already built, not random wishlist items
- whyItMatters: focus on user outcomes, not technical benefits ("saves time", "builds trust", "reduces churn")
- gaps: only for existing features, be honest about real limitations users would notice`;

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
        emit({ phase: 'scanning', message: 'Scanning codebase...' });

        const base = await buildBaseAnalysis(resolved);
        emit({ phase: 'base', data: base });

        emit({ phase: 'analyzing', message: 'Identifying features from a user perspective...' });

        const context = await buildTestContext(resolved, base.runner);

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 8000,
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

        const clean = fullText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        let features: AppFeature[] = [];
        try {
          const parsed = JSON.parse(clean);
          features = Array.isArray(parsed) ? parsed : parsed.features ?? [];
        } catch {
          features = [];
        }

        emit({ phase: 'complete', features });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to analyze features';
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
