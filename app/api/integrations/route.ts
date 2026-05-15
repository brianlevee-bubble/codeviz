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

const SYSTEM_PROMPT = `You are a code analyst specializing in third-party integrations and external service dependencies. Analyze the codebase and return ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

The JSON must match this exact schema:
{
  "integrations": [
    {
      "id": "string (snake_case, unique, e.g. stripe_payments)",
      "name": "string (service name, e.g. 'Stripe')",
      "category": "payment|auth|email|storage|analytics|messaging|database|api|monitoring|cdn|search|ai|other",
      "description": "string (what this integration does in the app, max 120 chars)",
      "package": "string (npm package name, optional)",
      "version": "string (package version, optional)",
      "docsUrl": "string (official docs URL, optional)",
      "endpoints": [
        {
          "method": "string (GET|POST|PUT|DELETE|WEBHOOK|SDK_CALL)",
          "path": "string (API endpoint or SDK method, e.g. '/api/webhooks/stripe' or 'stripe.charges.create')",
          "file": "string (relative file path where this call lives)",
          "description": "string (what this endpoint/call does, max 80 chars)"
        }
      ],
      "configKeys": [
        {
          "key": "string (env var or config key, e.g. 'STRIPE_SECRET_KEY')",
          "value": "string (placeholder or description, never actual secrets — use '***' for secrets)",
          "file": "string (file where referenced)",
          "line": null,
          "isSecret": true
        }
      ],
      "files": ["string (all files that reference this integration)"],
      "status": "active|unused|misconfigured"
    }
  ],
  "summary": {
    "total": 0,
    "byCategory": { "payment": 1, "auth": 1 },
    "missingEnvVars": ["STRIPE_SECRET_KEY"]
  }
}

RULES:
- Detect integrations from: package.json dependencies, import statements, env vars, API routes, webhook handlers, SDK initialization
- Categories: payment (Stripe, PayPal), auth (Auth0, NextAuth, Clerk, Supabase Auth), email (SendGrid, Resend, Postmark), storage (S3, Cloudinary, Uploadthing), analytics (PostHog, Segment, GA), messaging (Twilio, Slack), database (Supabase, Firebase, PlanetScale), api (REST clients, GraphQL), monitoring (Sentry, DataDog), cdn (Cloudflare, Vercel), search (Algolia, MeiliSearch), ai (OpenAI, Anthropic, Replicate)
- Mark "unused" if the package is installed but never imported/used
- Mark "misconfigured" if env vars are referenced but likely missing (no .env.example entry)
- NEVER include actual secret values — use '***' placeholders
- Include webhook endpoints and callback URLs
- Include SDK initialization patterns and where they live
- Max 20 integrations — focus on the most significant ones
- Include the Anthropic/OpenAI SDK if present — it counts as an integration`;

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
        emit({ phase: 'reading', message: 'Reading codebase...' });
        const tree = await walkDirectory(resolved);

        emit({ phase: 'chunking', message: 'Selecting relevant files...' });
        const context = await buildChunkedContext(tree, resolved);
        const prompt = buildAnalysisPrompt(context, resolved);

        emit({ phase: 'analyzing', message: 'Detecting integrations...' });

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
        let result = { integrations: [], summary: { total: 0, byCategory: {}, missingEnvVars: [] } };
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
