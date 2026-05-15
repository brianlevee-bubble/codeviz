export const runtime = 'nodejs';

import path from 'path';
import { stat } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { buildBaseAnalysis, buildTestContext } from '@/lib/test-runner/test-analyzer';
import type { AppFeature, FeatureDetails } from '@/lib/features/types';

const client = new Anthropic();

function sse(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const SYSTEM_PROMPT = `You are a senior engineer and product consultant analyzing a specific feature in a web application codebase.

Given a feature and the codebase context, return a JSON object with this exact schema:
{
  "howItWorks": "string (for existing features: 2-4 sentences explaining how it's implemented — what routes/components/services power it, in plain language. Omit for suggested features.)",
  "suggestedTests": [
    {
      "title": "string (short test name, max 60 chars)",
      "description": "string (what to test and why, 1-2 sentences, max 150 chars)",
      "type": "unit|integration|e2e"
    }
  ],
  "improvements": [
    {
      "title": "string (improvement name, max 60 chars)",
      "description": "string (what to change and the benefit, 1-2 sentences, max 150 chars)",
      "priority": "high|medium|low"
    }
  ]
}

RULES:
- Return ONLY valid JSON — no markdown, no code fences
- Suggest 3–5 realistic, specific tests (not generic "test that it works")
- Suggest 3–5 concrete improvements — mix of quick wins and larger ideas
- For existing features: howItWorks should reference actual patterns visible in the codebase
- For suggested features: omit howItWorks entirely
- Test types: unit=isolated function/component, integration=multiple modules together, e2e=user-facing browser flow
- Improvement priority: high=significant user impact or risk, medium=noticeable improvement, low=polish/nice-to-have
- Be specific: mention concrete things like "add rate limiting", "add optimistic updates", "add keyboard shortcuts" rather than vague advice`;

export async function POST(request: Request) {
  let body: { path?: string; feature?: AppFeature };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { path: dirPath, feature } = body;

  if (!dirPath || typeof dirPath !== 'string' || dirPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }
  if (!feature || typeof feature !== 'object') {
    return Response.json({ error: 'Invalid feature' }, { status: 400 });
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
        emit({ phase: 'scanning' });

        const base = await buildBaseAnalysis(resolved);
        const context = await buildTestContext(resolved, base.runner);

        emit({ phase: 'analyzing' });

        const featureSummary = `
FEATURE TO ANALYZE:
- Name: ${feature.name}
- Status: ${feature.status} (${feature.status === 'existing' ? 'already built' : 'not yet built'})
- Category: ${feature.category}
- Description: ${feature.description}
- Why it matters: ${feature.whyItMatters}
${feature.gaps ? `- Known gaps: ${feature.gaps}` : ''}
`.trim();

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `${featureSummary}\n\n---\n\nCODEBASE CONTEXT:\n${context}`,
          }],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        const clean = fullText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
        let details: Omit<FeatureDetails, 'featureId'> = { suggestedTests: [], improvements: [] };
        try {
          details = JSON.parse(clean);
        } catch { /* leave defaults */ }

        emit({ phase: 'complete', details: { ...details, featureId: feature.id } });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to analyze feature';
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
