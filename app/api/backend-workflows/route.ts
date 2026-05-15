export const runtime = 'nodejs';

import path from 'path';
import { readFile, access } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';
import type { BackendWorkflowsAnalysis } from '@/lib/backend-workflows/types';

const execAsync = promisify(exec);
const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

const GREP_EXCLUDE = "grep -v node_modules | grep -v .next | grep -v dist | grep -v '.test.' | grep -v '.spec.'";
const GREP_INCLUDE = '--include="*.ts" --include="*.tsx" --include="*.js"';

async function findBackendFiles(cwd: string): Promise<string[]> {
  const patterns = [
    // API route handlers
    'export.*async.*function.*(GET|POST|PUT|PATCH|DELETE)',
    // Server actions
    '"use server"',
    // Cron / scheduled tasks
    'cron|schedule|setInterval|CronJob',
    // Queue / background job patterns
    'queue|worker|job|bull|bullmq|agenda|bee-queue',
    // Webhook handlers
    'webhook|stripe.*event|paymentIntent',
    // Middleware / auth flows
    'middleware|NextResponse.next|NextResponse.redirect',
    // Database operations in server context
    'prisma|drizzle|knex|sequelize|mongoose|db\\.',
    // Email / notification dispatch
    'sendEmail|resend|nodemailer|sendgrid|postmark',
  ];

  const fileSet = new Set<string>();

  for (const pattern of patterns) {
    try {
      const { stdout } = await execAsync(
        `grep -rl ${GREP_INCLUDE} "${pattern}" . 2>/dev/null | ${GREP_EXCLUDE} | head -8`,
        { cwd, timeout: 6000 }
      );
      for (const f of stdout.trim().split('\n').filter(Boolean)) {
        fileSet.add(f.replace(/^\.\//, ''));
      }
    } catch { /* ignore */ }
  }

  // Also check common backend directories
  const dirs = ['app/api', 'src/app/api', 'pages/api', 'src/pages/api', 'src/server', 'server', 'src/workers', 'workers', 'src/jobs', 'jobs', 'src/lib/server', 'lib/server'];
  for (const dir of dirs) {
    try {
      const { stdout } = await execAsync(
        `find ${dir} -maxdepth 3 \\( -name "*.ts" -o -name "*.tsx" \\) 2>/dev/null | head -12`,
        { cwd, timeout: 3000 }
      );
      for (const f of stdout.trim().split('\n').filter(Boolean)) {
        fileSet.add(f.replace(/^\.\//, ''));
      }
    } catch { /* ignore */ }
  }

  return [...fileSet].slice(0, 20);
}

async function readWithImports(absPath: string, cwd: string, maxImports = 3): Promise<string> {
  const content = await readFile(absPath, 'utf-8').catch(() => '');
  if (!content) return '';

  const rel = path.relative(cwd, absPath);
  const parts: string[] = [`// FILE: ${rel}\n${content.slice(0, 10000)}`];

  const importRe = /from\s+['"]([./][^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  let count = 0;

  while ((match = importRe.exec(content)) !== null && count < maxImports) {
    const importPath = match[1];
    const baseDir = path.dirname(absPath);
    const resolved = path.resolve(baseDir, importPath);

    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
      const candidate = resolved + ext;
      if (candidate.includes('node_modules') || candidate.includes('.next')) continue;
      if (!(await fileExists(candidate))) continue;
      const importContent = await readFile(candidate, 'utf-8').catch(() => null);
      if (importContent) {
        const importRel = path.relative(cwd, candidate);
        parts.push(`// FILE: ${importRel} (imported)\n${importContent.slice(0, 5000)}`);
        count++;
        break;
      }
    }
  }

  return parts.join('\n\n');
}

const SYSTEM_PROMPT = `You are an expert backend architect. Analyze the provided source files and extract all backend workflows — sequences of server-side operations that accomplish a business process.

Return ONLY a raw JSON object with this exact schema (no markdown fences, no explanation):

{
  "workflows": [
    {
      "id": "string (snake_case unique id, e.g. create_order_flow)",
      "name": "string (human-readable name, e.g. Create Order)",
      "description": "string (one sentence describing what this workflow does)",
      "triggerType": "api-route | server-action | cron | webhook | queue | event",
      "entryFile": "string (relative path to the file that starts this workflow)",
      "steps": [
        {
          "id": "string (snake_case unique within workflow)",
          "label": "string (short human-readable name)",
          "description": "string (what this step does)",
          "kind": "trigger | process | data | integration | decision | output | error-handler",
          "file": "string (optional, relative file path)",
          "method": "string (optional, function/method name)"
        }
      ],
      "connections": [
        {
          "id": "string (unique, e.g. c_step1_step2)",
          "from": "string (step id)",
          "to": "string (step id)",
          "label": "string (optional, e.g. 'on success', 'next')",
          "condition": "string (optional, for decision branches, e.g. 'valid = true')"
        }
      ]
    }
  ]
}

## Step kinds

- **trigger**: The entry point — an API route handler, server action, cron schedule, webhook receiver, queue consumer, or event listener. Every workflow must start with exactly one trigger.
- **process**: Business logic, validation, transformation, computation. Examples: validate input, calculate totals, parse payload, transform data.
- **data**: Database or data store operations. Examples: query user, insert order, update status, delete record, cache lookup.
- **integration**: External API or service calls. Examples: call Stripe API, send to S3, fetch from third-party, call Claude API.
- **decision**: Conditional branch point — renders as a diamond. Use when the flow splits based on a condition. Examples: "User exists?", "Payment valid?", "Has permission?".
- **output**: Final response or side effect. Examples: return JSON response, send email, push notification, emit event, redirect.
- **error-handler**: Error handling / catch blocks. Examples: log error, return error response, retry logic, rollback transaction.

## Extraction rules

1. Each distinct API route handler (GET, POST, PUT, DELETE), server action, cron job, webhook handler, or queue consumer is a separate workflow.
2. Follow the execution flow step by step — every meaningful operation should be a node.
3. For conditional branches (if/else, switch, try/catch), create a decision node with separate outgoing connections for each branch.
4. Group related database calls if they're part of the same transaction.
5. Every workflow must have at least a trigger step and one other step.
6. Connections should form a DAG from trigger to outputs/error-handlers.
7. For try/catch blocks, create an error-handler step connected from the decision/process that might throw.
8. Name workflows after their business purpose ("Create User", "Process Payment"), not their technical implementation ("POST handler").
9. Return { "workflows": [] } if no backend workflows are found — never return invalid JSON.

## What to look for

- Next.js API routes (app/api/**/route.ts) — each exported HTTP method is a workflow
- Server actions ("use server") — each exported async function is a workflow
- Cron jobs / scheduled tasks — each scheduled function is a workflow
- Webhook handlers — each webhook endpoint is a workflow
- Queue consumers / workers — each job processor is a workflow
- Middleware chains — if they contain meaningful business logic`;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');

  if (!dirPath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'scanning', message: 'Searching for backend workflows…' });

        const relFiles = await findBackendFiles(resolved);

        if (relFiles.length === 0) {
          emit({ phase: 'complete', workflows: [] });
          controller.close();
          return;
        }

        emit({ phase: 'scanning', message: `Reading ${relFiles.length} backend file${relFiles.length === 1 ? '' : 's'}…` });

        const fileContexts: string[] = [];
        for (const rel of relFiles.slice(0, 15)) {
          const abs = path.join(resolved, rel);
          if (await fileExists(abs)) {
            const ctx = await readWithImports(abs, resolved, 3);
            if (ctx) fileContexts.push(ctx);
          }
        }

        if (fileContexts.length === 0) {
          emit({ phase: 'complete', workflows: [] });
          controller.close();
          return;
        }

        emit({ phase: 'analyzing', message: 'Extracting backend workflow definitions…' });

        const userMsg = `Extract all backend workflows from these source files. Trace the execution flow of each API route, server action, cron job, webhook handler, and background process step by step.\n\n${fileContexts.join('\n\n---\n\n')}`;

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        let analysis: BackendWorkflowsAnalysis = { workflows: [] };
        try {
          const cleaned = fullText.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
          analysis = JSON.parse(cleaned) as BackendWorkflowsAnalysis;
        } catch {
          analysis = { workflows: [] };
        }

        emit({ phase: 'complete', workflows: analysis.workflows });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Failed to analyze backend workflows' });
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
