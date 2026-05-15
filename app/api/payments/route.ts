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

const SYSTEM_PROMPT = `You are a code analyst specializing in payment systems and billing infrastructure. Analyze the codebase and return ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

The JSON must match this exact schema:
{
  "providers": [
    {
      "id": "string (snake_case, unique, e.g. stripe_main)",
      "provider": "stripe|paypal|square|braintree|adyen|razorpay|mollie|paddle|lemonsqueezy|other",
      "name": "string (display name, e.g. 'Stripe')",
      "description": "string (what this provider handles in the app, max 120 chars)",
      "package": "string (npm package name, optional)",
      "version": "string (package version, optional)",
      "docsUrl": "string (official docs URL, optional)",
      "status": "active|inactive|misconfigured",
      "envKeys": [
        {
          "key": "string (env var name, e.g. STRIPE_SECRET_KEY)",
          "description": "string (what this key is for)",
          "isSecret": true,
          "isSet": false
        }
      ],
      "webhooks": [
        {
          "event": "string (e.g. 'payment_intent.succeeded')",
          "path": "string (webhook endpoint path, e.g. '/api/webhooks/stripe')",
          "file": "string (relative file path)",
          "description": "string (what this webhook handles, max 80 chars)"
        }
      ],
      "products": [
        {
          "id": "string (unique product identifier)",
          "name": "string (product/plan name)",
          "type": "one-time|recurring",
          "priceDescription": "string (e.g. '$9.99/mo', '$49 one-time')",
          "file": "string (file where defined)"
        }
      ],
      "flows": [
        {
          "id": "string (unique flow id)",
          "name": "string (e.g. 'Checkout Flow')",
          "type": "checkout|subscription|one-time|invoice|marketplace|refund|payout",
          "description": "string (what this flow does, max 120 chars)",
          "steps": ["string (ordered steps in the flow)"],
          "files": ["string (files involved)"],
          "provider": "stripe|paypal|square|braintree|adyen|razorpay|mollie|paddle|lemonsqueezy|other"
        }
      ],
      "files": ["string (all files referencing this provider)"],
      "currencies": ["string (e.g. 'USD', 'EUR')"],
      "testMode": false
    }
  ],
  "flows": [
    {
      "id": "string",
      "name": "string",
      "type": "checkout|subscription|one-time|invoice|marketplace|refund|payout",
      "description": "string",
      "steps": ["string"],
      "files": ["string"],
      "provider": "stripe|paypal|square|braintree|adyen|razorpay|mollie|paddle|lemonsqueezy|other"
    }
  ],
  "summary": {
    "totalProviders": 0,
    "totalFlows": 0,
    "totalWebhooks": 0,
    "totalProducts": 0,
    "missingEnvVars": ["string"],
    "hasTestMode": false
  }
}

RULES:
- Detect payment providers from: package.json deps, imports, env vars, API routes, webhook handlers, SDK init
- Look for pricing pages, checkout components, subscription management, billing portals
- Detect products/plans from config files, constants, database schemas, Stripe product IDs
- Identify payment flows: checkout sessions, subscription creation, refund handling, invoice generation
- Detect webhook handlers and which events they process
- Mark "inactive" if the package is installed but not used in code
- Mark "misconfigured" if env vars are referenced but appear missing
- NEVER include actual secret values — use '***' placeholders
- Detect test mode usage (test keys, test webhook endpoints, sandbox URLs)
- Include currency configurations
- If no payment provider is detected, return empty arrays but still return valid JSON
- Max 10 providers — focus on the most significant ones`;

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

        emit({ phase: 'analyzing', message: 'Analyzing payment systems...' });

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
        let result = { providers: [], flows: [], summary: { totalProviders: 0, totalFlows: 0, totalWebhooks: 0, totalProducts: 0, missingEnvVars: [], hasTestMode: false } };
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
