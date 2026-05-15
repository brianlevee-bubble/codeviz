export const runtime = 'nodejs';

import path from 'path';
import { stat } from 'fs/promises';
import { walkDirectory } from '@/lib/analyzer/file-reader';
import { buildChunkedContext } from '@/lib/analyzer/chunker';
import { analyzeCodebase } from '@/lib/analyzer/claude-analyzer';
import { buildGraphData } from '@/lib/analyzer/graph-builder';

function sse(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const { directoryPath } = await request.json() as { directoryPath: string };

  if (!directoryPath || directoryPath.includes('\0')) {
    return Response.json({ error: 'Invalid path' }, { status: 400 });
  }
  const resolved = path.resolve(directoryPath);

  try {
    const stats = await stat(resolved);
    if (!stats.isDirectory()) {
      return Response.json({ error: 'Not a directory' }, { status: 400 });
    }
  } catch {
    return Response.json({ error: 'Path not found' }, { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY not configured. Add it to .env.local' },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        // Phase 1: read files
        send({ phase: 'reading', message: 'Reading files...' });
        const tree = await walkDirectory(resolved);

        // Phase 2: chunk
        send({ phase: 'chunking', message: 'Preparing context...' });
        const context = await buildChunkedContext(tree, resolved);
        send({
          phase: 'chunking',
          message: `Analyzing ${context.primaryFiles.length} files (~${Math.round(context.totalEstimatedTokens / 1000)}K tokens)`,
        });

        // Phase 3: analyze with Claude (retry concisely if truncated)
        let rawOutput = '';
        let attempt = 0;

        while (attempt < 2) {
          rawOutput = '';
          const concise = attempt > 0;

          if (concise) {
            send({ phase: 'analyzing', message: 'Response was too long — retrying with condensed output...' });
          } else {
            send({ phase: 'analyzing', message: 'Asking Claude to analyze...' });
          }

          try {
            await analyzeCodebase(context, resolved, (token) => {
              rawOutput += token;
              send({ phase: 'analyzing', token });
            }, concise);
            break; // success
          } catch (err) {
            if (err instanceof Error && err.message === 'TRUNCATED' && attempt === 0) {
              attempt++;
              continue;
            }
            throw err;
          }
        }

        // Phase 4: build graph
        send({ phase: 'chunking', message: 'Building graph...' });
        const graph = buildGraphData(rawOutput);

        send({ phase: 'complete', graph });
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Analysis failed';
        send({ phase: 'error', error: message });
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
