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

const SYSTEM_PROMPT = `You are an authentication and authorization analyst for web applications. Analyze the codebase and return ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

Return this exact schema:
{
  "detected": {
    "provider": "nextauth|clerk|supabase|firebase|lucia|authjs|custom|none",
    "label": "string (human name, e.g. 'NextAuth.js v5', 'Clerk', 'No auth detected')",
    "configFile": "string (main auth config file path, optional)",
    "features": ["email_password|magic_link|oauth_google|oauth_github|oauth_microsoft|oauth_apple|oauth_other|two_factor|session_jwt|session_database|role_based|api_key|webhook"],
    "envVars": [
      { "name": "string (env var name)", "set": boolean }
    ],
    "routes": [
      {
        "path": "string (URL path, e.g. /login, /api/auth/[...nextauth])",
        "file": "string (relative file path)",
        "type": "login|register|callback|logout|verify|reset|api|middleware",
        "description": "string (what this route does, max 60 chars)"
      }
    ],
    "issues": [
      {
        "severity": "error|warning|info",
        "message": "string (description of the issue)",
        "file": "string (file where the issue is, optional)",
        "fix": "string (suggested fix, optional)"
      }
    ]
  },
  "recommendations": [
    {
      "id": "string (snake_case unique, e.g. add_google_oauth)",
      "feature": "email_password|magic_link|oauth_google|oauth_github|oauth_microsoft|oauth_apple|oauth_other|two_factor|session_jwt|session_database|role_based|api_key|webhook",
      "label": "string (short action label, e.g. 'Add Google OAuth')",
      "description": "string (what this adds and why, max 120 chars)",
      "effort": "low|medium|high",
      "priority": "recommended|optional|advanced"
    }
  ],
  "availableProviders": [
    {
      "provider": "nextauth|clerk|supabase|firebase|lucia|authjs|custom",
      "label": "string (display name)",
      "description": "string (one-line description, max 80 chars)",
      "configFile": "string (typical config file path)",
      "envVars": ["string (required env vars)"],
      "features": ["string (features this provider supports out of the box)"],
      "setupSteps": ["string (ordered setup steps, max 6 steps)"]
    }
  ]
}

RULES:
- If the codebase has NO authentication at all, set detected.provider to "none" and detected.label to "No auth detected"
- For detected: find auth libraries in package.json/imports, auth config files, middleware checking auth, login/signup pages, session handling
- Look for: next-auth, @auth/*, @clerk/*, @supabase/*, firebase/auth, lucia, bcrypt/argon2 (custom auth)
- envVars: check .env.example, .env.local.example, or references in code for auth-related env vars (SECRET, KEY, URL, etc.)
- routes: find all auth-related routes (login, register, callback, logout, password reset, email verify, auth API routes, auth middleware)
- issues: security problems like missing CSRF protection, session not httpOnly, missing rate limiting on login, exposed secrets, missing middleware on protected routes
- recommendations: suggest missing features appropriate for the app (e.g. if no 2FA, suggest it; if no OAuth, suggest popular providers)
- availableProviders: list 3-4 providers that would work well with this codebase (considering the framework)
- If auth IS detected, put the detected provider first in availableProviders and mark features already configured`;

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

        emit({ phase: 'analyzing', message: 'Analyzing authentication setup…' });

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
        let result = { detected: null, recommendations: [], availableProviders: [] };
        try {
          result = JSON.parse(clean);
        } catch {
          emit({ phase: 'error', error: 'Failed to parse Claude response' });
          return;
        }

        emit({ phase: 'complete', analysis: result });
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
