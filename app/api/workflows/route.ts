export const runtime = 'nodejs';

import path from 'path';
import { readFile, access } from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';
import type { WorkflowsAnalysis } from '@/lib/workflows/types';

const execAsync = promisify(exec);
const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

// ── Grep for files containing Status/State/Phase enums or transition patterns ─

const GREP_EXCLUDE = "grep -v node_modules | grep -v .next | grep -v dist | grep -v '.test.' | grep -v '.spec.'";
const GREP_INCLUDE = '--include="*.ts" --include="*.tsx" --include="*.js"';

async function findWorkflowFiles(cwd: string): Promise<string[]> {
  const patterns = [
    // Status/State/Phase enum or type definitions
    'enum.*Status|enum.*State|enum.*Phase',
    // Next.js server actions (contain "use server" directive — key for business logic)
    '"use server"',
    // Role-based permission checks near status transitions
    'isAdmin|canApprove|role.*ADMIN|role.*OWNER|hasPermission',
    // Common review/approval workflow function names
    'approveTask|requestChanges|rejectTask|approveOrder|submitForReview',
    // Status assignment patterns
    'status.*=.*["\']IN_REVIEW|status.*=.*["\']DONE|status.*=.*["\']APPROVED',
    // Review-gating patterns
    'reviewRequired|PENDING_APPROVAL|IN_REVIEW',
    // Notification side-effects (email, Slack, webhooks)
    'sendEmail|sendSlack|webhook|notification|notify|nodemailer|resend|postMessage',
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

  // Also probe common action/service directories for any .ts/.tsx files with status logic
  const actionDirs = ['src/actions', 'actions', 'src/services', 'services', 'src/lib', 'lib'];
  for (const dir of actionDirs) {
    try {
      const { stdout } = await execAsync(
        `find ${dir} -maxdepth 2 \\( -name "*.ts" -o -name "*.tsx" \\) 2>/dev/null | head -10`,
        { cwd, timeout: 3000 }
      );
      for (const f of stdout.trim().split('\n').filter(Boolean)) {
        const abs = path.join(cwd, f);
        const snippet = await readFile(abs, 'utf-8').catch(() => '');
        if (/status|Status|state|State|approve|review/i.test(snippet)) {
          fileSet.add(f.replace(/^\.\//, ''));
        }
      }
    } catch { /* ignore */ }
  }

  return [...fileSet].slice(0, 12);
}

// ── Read a file and its direct imports (one level deep) ───────────────────────

async function readWithImports(absPath: string, cwd: string, maxImports = 4): Promise<string> {
  const content = await readFile(absPath, 'utf-8').catch(() => '');
  if (!content) return '';

  const rel = path.relative(cwd, absPath);
  // Read more of action/service files since they contain the transition logic
  const isActionFile = /actions?\/|services?\//i.test(rel);
  const parts: string[] = [`// FILE: ${rel}\n${content.slice(0, isActionFile ? 12000 : 8000)}`];

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

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software architect. Analyze the provided source files and extract all state machine / workflow definitions.

Return ONLY a raw JSON object with this exact schema (no markdown fences, no explanation):

{
  "workflows": [
    {
      "id": "string (snake_case unique id, e.g. task_workflow)",
      "entity": "string (the domain entity, e.g. Task, Order, Invoice)",
      "enumName": "string (the TypeScript enum/type name if found, e.g. TaskStatus)",
      "file": "string (relative file path where the enum/type is defined)",
      "description": "string (one sentence describing what this workflow controls)",
      "states": [
        {
          "id": "string (snake_case, e.g. in_review)",
          "label": "string (the enum value as-is, e.g. IN_REVIEW)",
          "description": "string (optional, what this state means)",
          "kind": "initial | active | review | terminal | error"
        }
      ],
      "transitions": [
        {
          "id": "string (snake_case unique, e.g. submit_for_review)",
          "from": "string (state id)",
          "to": "string (state id)",
          "action": "string (human-readable action label, e.g. Submit, Approve, Request Changes)",
          "actors": ["string (role names who can trigger this, e.g. EDIT, ADMIN, OWNER)"],
          "guards": ["string (conditions that gate this transition, e.g. reviewRequired = true)"],
          "sideEffects": ["string (async effects fired by this transition, e.g. email to assignee, Slack notification)"],
          "isRegression": false
        }
      ]
    }
  ]
}

## Extraction rules

### Finding states
- Detect every enum, union type, or const object whose name ends with Status, State, Phase, or Step
- Also detect string-literal unions used as status fields (e.g. type Status = "TODO" | "DONE")
- StateKind "gateway" represents a decision point / conditional branch — render as a diamond node:
  { "id": "review_required_gate", "label": "Review required?", "kind": "gateway", "description": "" }
  Use gateways whenever a function conditionally routes to DIFFERENT target states based on a runtime condition.

### Finding transitions — CRITICAL
A single function that routes to DIFFERENT states based on a condition = a GATEWAY node + two outgoing transitions:

  Example — if this code exists:
    async function updateTaskStatus(status) {
      if (status === "DONE" && project.reviewRequired && !isAdmin) {
        await db.update({ status: "IN_REVIEW" });
      } else {
        await db.update({ status });
      }
    }

  Emit a gateway node and route through it:
    State:  { "id": "review_gate", "label": "Review required?", "kind": "gateway" }
    Transitions:
      { from: "in_progress", to: "review_gate",  action: "Complete", actors: ["EDIT"] }
      { from: "review_gate",  to: "in_review",    action: "Yes",      guards: ["reviewRequired = true", "user is not admin"] }
      { from: "review_gate",  to: "done",          action: "No",       guards: ["reviewRequired = false OR user is admin"] }

  Do this for EVERY conditional branch point in the transition logic.
  Similarly, if an admin review function can either approve or reject:
    State:  { "id": "admin_review_gate", "label": "Admin reviews", "kind": "gateway" }
    Transitions:
      { from: "in_review",       to: "admin_review_gate", action: "Submit for review" }
      { from: "admin_review_gate", to: "done",             action: "Approve",          actors: ["ADMIN", "OWNER"] }
      { from: "admin_review_gate", to: "in_progress",      action: "Request Changes",  actors: ["ADMIN", "OWNER"], isRegression: true }

### Extracting actors from permission checks
- Code like: \`if (!isAdmin) throw error\` before a db.update → only ADMIN/OWNER can trigger that transition
- Code like: \`permission.level === "EDIT"\` allows the EDIT role
- Code like: \`member.role === "OWNER" || member.role === "ADMIN"\` → actors: ["ADMIN", "OWNER"]
- If no role check is present, infer from context: admin-only functions (approve, reject) get ["ADMIN", "OWNER"]; regular mutations get ["EDIT"]
- Name actors after their role string (ADMIN, OWNER, EDIT, MEMBER, etc.)

### Extracting guards from conditionals
- Any \`if\` condition that determines WHICH state to transition to becomes a guard
- Write guards as human-readable phrases: "reviewRequired = true", "user is not admin", "quota > 0"
- Keep guards short (< 40 chars)

### Extracting side-effects
After each transition function, look for fire-and-forget async calls that send notifications or trigger external services.
These appear as: \`void fn()\`, \`Promise.allSettled([...])\`, \`sendEmail(...)\`, \`fetch(webhookUrl, ...)\`, or similar.
**IMPORTANT**: If a helper function (e.g. \`notifyTaskCompleted\`) is called and its definition in the provided files shows it internally calls MULTIPLE services (e.g. \`Promise.allSettled([sendEmail(...), sendSlack(...)])\`), list ALL of those services as separate sideEffects entries — do not collapse them into one.
Capture each as a short human-readable string in sideEffects[]:
- Email sends → "email to [recipient]" (e.g. "email to assignee", "email to owner")
- Slack messages → "Slack notification" or "Slack #[channel]" if channel is known
- Webhooks → "webhook" or "webhook: [description]"
- Push notifications, SMS, other async effects → short description
Keep each string under 40 chars. Only include effects directly caused by this specific transition, not shared infrastructure.
If no side-effects, omit sideEffects or use [].

### Regression detection
- isRegression: true when the target state is earlier in the workflow than the source
- Common regressions: APPROVED → PENDING, IN_REVIEW → IN_PROGRESS, DONE → IN_PROGRESS
- These render as dashed amber edges in the diagram — mark them accurately

### StateKind classification
- initial:  starting state when created (TODO, DRAFT, PENDING, NEW, OPEN, CREATED)
- active:   work in progress (IN_PROGRESS, PROCESSING, ACTIVE, WORKING, STARTED)
- review:   awaiting human approval (IN_REVIEW, PENDING_APPROVAL, UNDER_REVIEW, SUBMITTED, AWAITING)
- terminal: final success (DONE, COMPLETED, APPROVED, CLOSED, PUBLISHED, RESOLVED, ARCHIVED)
- error:    failed or rejected (REJECTED, FAILED, CANCELLED, BLOCKED, ERRORED, INVALID)
- gateway:  conditional decision point — NOT a real status value, but a routing node you introduce to represent an if/else branch; its label should be a yes/no question (e.g. "Review required?", "Admin approves?")

### Additional rules
- Only include states actually reachable via transition logic — drop dead/orphan states
- If the same status type is used across multiple entity types, create one workflow per entity
- Name the "action" field after the function name or user-facing verb, not the status name
  (e.g. "Request Changes" not "Set IN_PROGRESS", "Approve" not "Set DONE")
- Return { "workflows": [] } if no state machines are found — never return invalid JSON`;

// ─── Route handler ─────────────────────────────────────────────────────────────

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
        emit({ phase: 'scanning', message: 'Searching for state machines…' });

        const relFiles = await findWorkflowFiles(resolved);

        if (relFiles.length === 0) {
          emit({ phase: 'complete', workflows: [] });
          controller.close();
          return;
        }

        emit({ phase: 'scanning', message: `Reading ${relFiles.length} file${relFiles.length === 1 ? '' : 's'}…` });

        // Read files + their direct imports — prioritise action/service files
        const sortedFiles = relFiles.sort((a, b) => {
          const aIsAction = /actions?\/|services?\//i.test(a) ? -1 : 0;
          const bIsAction = /actions?\/|services?\//i.test(b) ? -1 : 0;
          return aIsAction - bIsAction;
        });

        const fileContexts: string[] = [];
        for (const rel of sortedFiles.slice(0, 10)) {
          const abs = path.join(resolved, rel);
          if (await fileExists(abs)) {
            const ctx = await readWithImports(abs, resolved, 4);
            if (ctx) fileContexts.push(ctx);
          }
        }

        if (fileContexts.length === 0) {
          emit({ phase: 'complete', workflows: [] });
          controller.close();
          return;
        }

        emit({ phase: 'analyzing', message: 'Extracting workflow definitions…' });

        const userMsg = `Extract all state machine / workflow definitions from these source files. Pay close attention to conditional branching inside status-update functions — each branch that writes a different status value is a separate transition with its own guards and actors.\n\n${fileContexts.join('\n\n---\n\n')}`;

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 6000,
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

        // Parse and emit
        let analysis: WorkflowsAnalysis = { workflows: [] };
        try {
          const cleaned = fullText.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
          analysis = JSON.parse(cleaned) as WorkflowsAnalysis;
        } catch {
          // If parse fails, return empty
          analysis = { workflows: [] };
        }

        emit({ phase: 'complete', workflows: analysis.workflows });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Failed to analyze workflows' });
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
