export const runtime = 'nodejs';

import path from 'path';
import { stat, readFile } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// Extract import paths from source content
function extractImportPaths(content: string, baseDir: string, rootDir: string): string[] {
  const importRegex = /(?:import|from)\s+['"]([^'"]+)['"]/g;
  const paths: string[] = [];
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const imp = match[1];
    if (imp.startsWith('.')) {
      // Relative import
      const resolved = path.resolve(baseDir, imp);
      paths.push(resolved);
    } else if (imp.startsWith('@/')) {
      // Alias import
      const rel = imp.slice(2);
      paths.push(path.resolve(rootDir, rel));
    }
  }
  return paths;
}

// Try to read a file with common extensions
async function tryReadFile(filePath: string): Promise<string | null> {
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
  for (const ext of extensions) {
    try {
      return await readFile(filePath + ext, 'utf-8');
    } catch { /* try next */ }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  const file = searchParams.get('file');
  const focus = searchParams.get('focus') || 'all';

  if (!dirPath || !file) {
    return Response.json({ error: 'Missing path or file parameter' }, { status: 400 });
  }

  const resolved = path.resolve(dirPath);
  const filePath = path.resolve(resolved, file);

  if (!filePath.startsWith(resolved)) {
    return Response.json({ error: 'Path traversal not allowed' }, { status: 400 });
  }

  try {
    await stat(filePath);
  } catch {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(data: unknown) {
        controller.enqueue(encoder.encode(sse(data)));
      }

      try {
        emit({ phase: 'scanning', message: 'Reading source file…' });

        const sourceContent = await readFile(filePath, 'utf-8');
        const relFile = path.relative(resolved, filePath);
        const fileDir = path.dirname(filePath);

        // Read imported files (1 level deep) for type context
        emit({ phase: 'scanning', message: 'Reading imported files for context…' });
        const importPaths = extractImportPaths(sourceContent, fileDir, resolved);
        const importedFiles: Array<{ path: string; content: string }> = [];

        for (const imp of importPaths.slice(0, 8)) { // cap at 8 imports
          const content = await tryReadFile(imp);
          if (content) {
            const rel = path.relative(resolved, imp);
            importedFiles.push({ path: rel, content: content.slice(0, 3000) });
          }
        }

        emit({ phase: 'analyzing', message: 'Analyzing code…' });

        const focusInstructions: Record<string, string> = {
          all: 'bugs, security vulnerabilities, performance issues, and code quality',
          security: 'security vulnerabilities, authentication/authorization flaws, injection risks, data exposure, and insecure patterns',
          performance: 'performance bottlenecks, unnecessary re-renders, N+1 queries, memory leaks, and optimization opportunities',
          bugs: 'logic errors, null/undefined handling, race conditions, incorrect assumptions, and edge cases',
        };

        const focusText = focusInstructions[focus] || focusInstructions.all;

        const systemPrompt = `You are a senior software engineer performing a thorough code review.
Review the provided code focusing on: ${focusText}.

For each issue found:
- State the specific problem clearly
- Explain why it matters
- Provide a concrete fix with code if applicable

Structure your response with these sections (only include sections with issues):
## 🔴 Critical
## 🟠 High
## 🟡 Medium
## 🟢 Low
## ✅ Summary

Under Summary, briefly list what the code does well and your top 3 actionable recommendations.

Return ONLY the review in markdown — no preamble.`;

        const contextFiles = importedFiles.length > 0
          ? '\n\n**Imported files for context:**\n' + importedFiles.map(f =>
              `\`${f.path}\`:\n\`\`\`\n${f.content}\n\`\`\``
            ).join('\n\n')
          : '';

        const userMessage = `Review this file: \`${relFile}\`

\`\`\`${relFile.endsWith('.tsx') || relFile.endsWith('.jsx') ? 'tsx' : 'ts'}
${sourceContent.slice(0, 15000)}
\`\`\`${contextFiles}`;

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-5',
          max_tokens: 8000,
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
          file: relFile,
          focus,
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
