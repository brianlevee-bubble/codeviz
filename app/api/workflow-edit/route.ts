export const runtime = 'nodejs';

import path from 'path';
import { readFile, stat } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import type { Workflow } from '@/lib/workflows/types';
import type { FileDiff } from '@/lib/types';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert TypeScript developer. Given source code and workflow changes described as JSON, generate the minimal code modifications needed to implement them.

Return ONLY a JSON array of file diffs (no markdown fences, no explanation):
[
  {
    "file": "relative/path/to/file.ts",
    "before": "entire original file content",
    "after": "entire modified file content"
  }
]

Rules:
- Return the FULL file content in "before" and "after" fields, not just changed lines
- Only include files that actually need changes
- Preserve existing code style, imports, and formatting
- For new enum values: add to the enum/union type
- For removed enum values: remove from the enum/union type AND remove any switch/if cases
- For new transitions: add the corresponding permission checks and state transition logic
- For removed transitions: remove the corresponding code paths
- For modified transitions: update action names, guards, and actor permission checks
- If no files need changing, return []`;

export async function POST(request: Request) {
  const body = await request.json() as {
    directoryPath: string;
    originalWorkflow: Workflow;
    editedWorkflow: Workflow;
  };

  const { directoryPath, originalWorkflow, editedWorkflow } = body;

  if (!directoryPath || directoryPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }

  const resolved = path.resolve(directoryPath);
  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) throw new Error('Not a directory');
  } catch {
    return Response.json({ error: 'Directory not found' }, { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const sourceFile = originalWorkflow.file;
  const absSourceFile = path.join(resolved, sourceFile);
  const sourceContent = await readFile(absSourceFile, 'utf-8').catch(() => '');

  // Summarize what changed
  const addedStates = editedWorkflow.states.filter(s => !originalWorkflow.states.find(o => o.id === s.id));
  const removedStates = originalWorkflow.states.filter(s => !editedWorkflow.states.find(e => e.id === s.id));
  const modifiedStates = editedWorkflow.states.filter(s => {
    const orig = originalWorkflow.states.find(o => o.id === s.id);
    return orig && JSON.stringify(orig) !== JSON.stringify(s);
  });
  const addedTransitions = editedWorkflow.transitions.filter(t => !originalWorkflow.transitions.find(o => o.id === t.id));
  const removedTransitions = originalWorkflow.transitions.filter(t => !editedWorkflow.transitions.find(e => e.id === t.id));
  const modifiedTransitions = editedWorkflow.transitions.filter(t => {
    const orig = originalWorkflow.transitions.find(o => o.id === t.id);
    return orig && JSON.stringify(orig) !== JSON.stringify(t);
  });

  const changeSummary = [
    addedStates.length > 0 && `Added states: ${addedStates.map(s => s.label).join(', ')}`,
    removedStates.length > 0 && `Removed states: ${removedStates.map(s => s.label).join(', ')}`,
    modifiedStates.length > 0 && `Modified states: ${modifiedStates.map(s => s.label).join(', ')}`,
    addedTransitions.length > 0 && `Added transitions: ${addedTransitions.map(t => t.action).join(', ')}`,
    removedTransitions.length > 0 && `Removed transitions: ${removedTransitions.map(t => t.action).join(', ')}`,
    modifiedTransitions.length > 0 && `Modified transitions: ${modifiedTransitions.map(t => t.action).join(', ')}`,
  ].filter(Boolean).join('\n');

  const userMsg = `Here is the primary source file for the "${originalWorkflow.entity}" (${originalWorkflow.enumName ?? ''}) workflow:

// FILE: ${sourceFile}
${sourceContent}

Original workflow:
${JSON.stringify(originalWorkflow, null, 2)}

Modified workflow:
${JSON.stringify(editedWorkflow, null, 2)}

Changes needed:
${changeSummary}

Generate TypeScript code changes to implement these workflow modifications.`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const cleaned = text.replace(/^```[a-z]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    const diffs: FileDiff[] = JSON.parse(cleaned);
    return Response.json({ diffs });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate changes';
    return Response.json({ error: message }, { status: 500 });
  }
}
