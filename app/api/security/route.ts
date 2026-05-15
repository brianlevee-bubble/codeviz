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

const SYSTEM_PROMPT = `You are a security and privacy code analyst. Analyze the codebase and return ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

Return this exact schema:
{
  "globalPolicies": [
    {
      "description": "string (what this policy enforces globally)",
      "file": "string (relative file path, e.g. middleware.ts)",
      "code": "string (the actual code snippet, optional)"
    }
  ],
  "resources": [
    {
      "id": "string (snake_case unique, e.g. res_dashboard)",
      "label": "string (human-readable, e.g. 'Dashboard Page')",
      "route": "string (URL path if applicable, e.g. /dashboard)",
      "file": "string (relative file path)",
      "resourceType": "page|api|server_action|middleware",
      "summary": "string (one-line summary of access rules, max 80 chars)",
      "requiresAuth": boolean,
      "allowedRoles": ["string (role names, e.g. admin, user, owner)"],
      "rules": [
        {
          "id": "string (snake_case unique within parent)",
          "type": "requires_auth|requires_role|ownership|field_filter|rate_limit|input_validation|middleware|audit_log|encryption|pii",
          "label": "string (short label, max 30 chars)",
          "description": "string (full description of this rule, max 120 chars)",
          "code": "string (actual code implementing this rule, optional)",
          "roles": ["string"] (only for requires_role),
          "hiddenFields": ["string"] (only for field_filter)
        }
      ]
    }
  ],
  "allRoles": ["string (all distinct role/permission names found in the app)"],
  "roleGroups": [
    {
      "scope": "string (machine key: global|organization|project|workspace|team|resource or other short noun)",
      "scopeLabel": "string (human label shown in UI, e.g. 'App-wide', 'Per organization', 'Per project')",
      "description": "string (one sentence: what this scope governs, e.g. 'Controls access across the entire application')",
      "roles": ["string (role names that belong to this scope)"]
    }
  ]
}

RULES:
- globalPolicies: auth middleware, CORS, CSRF, rate limiting applied to all/most routes
- resources: pages, API routes, server actions that have security rules
- For each rule, copy the ACTUAL code snippet that implements it (requireAuth(), getServerSession(), where: { userId }, select: { password: false }, etc.)
- field_filter: look for select: { password: false }, omit password/secret fields, .exclude(), .omit()
- ownership: look for where: { userId: session.user.id }, checking resource.userId === user.id
- pii: look for fields like email, phone, ssn, address, dateOfBirth being handled
- input_validation: Zod schemas, validation middleware, sanitization
- Be thorough — include every page, API route, and server action that has ANY security check
- max 30 resources total, max 6 rules per resource
- allRoles: extract named permission roles only (e.g. "admin", "owner", "member", "editor") — exclude generic auth state strings like "authenticated", "unauthenticated", "public", "protected", "private", "session", "user" unless they represent a named permission level in a role-based system
- roleGroups: group roles by what they govern. If all roles apply at the same level (e.g. all are app-wide), return a single group. If the app has roles that scope to different things (e.g. org-level "admin" vs project-level "owner"), split them into separate groups. Every role in allRoles must appear in exactly one group. scopeLabel should be short and intuitive (≤ 20 chars)`;

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

        emit({ phase: 'analyzing', message: 'Analyzing security rules…' });

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
        let result = { globalPolicies: [], resources: [], allRoles: [] };
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
