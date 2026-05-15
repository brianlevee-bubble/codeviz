export const runtime = 'nodejs';

import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);
const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  const since = searchParams.get('since') || defaultSince();

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
        emit({ phase: 'scanning', message: 'Reading git log…' });

        // Fetch git log
        let gitLog: string;
        try {
          const { stdout } = await execAsync(
            `git log --format="%H|%ad|%an|%s" --date=short --since="${since}"`,
            { cwd: resolved }
          );
          gitLog = stdout.trim();
        } catch {
          emit({ phase: 'error', error: 'This directory is not a git repository or git is not available.' });
          controller.close();
          return;
        }

        if (!gitLog) {
          emit({
            phase: 'complete',
            output: `# Changelog\n\nNo commits found since ${since}.`,
            since,
          });
          controller.close();
          return;
        }

        // Parse commits
        const commits = gitLog.split('\n').filter(Boolean).map(line => {
          const [hash, date, author, ...rest] = line.split('|');
          return { hash: hash?.slice(0, 8), date, author, message: rest.join('|') };
        });

        emit({ phase: 'analyzing', message: `Writing release notes for ${commits.length} commits…` });

        const commitList = commits
          .map(c => `${c.date} [${c.hash}] ${c.author}: ${c.message}`)
          .join('\n');

        const systemPrompt = `You are a technical writer generating a changelog from git commits.
Group commits into: ## Features, ## Bug Fixes, ## Improvements, ## Chores (only include sections that have relevant commits).
- Write in present tense: "Add...", "Fix...", "Update..."
- Ignore trivial chore commits (merge commits, version bumps, whitespace)
- Be concise but descriptive — expand abbreviations if obvious
- Return ONLY the markdown changelog — no explanation, no frontmatter`;

        const userMessage = `Generate a changelog from these git commits (since ${since}):\n\n${commitList}\n\nWrite the release notes as markdown.`;

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        });

        let fullText = '';
        for await (const event of claudeStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text;
            emit({ phase: 'token', token: event.delta.text });
          }
        }

        emit({
          phase: 'complete',
          output: fullText.trim(),
          since,
          commitCount: commits.length,
        });
      } catch (err) {
        emit({ phase: 'error', error: err instanceof Error ? err.message : 'Failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
