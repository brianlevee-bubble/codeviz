export const runtime = 'nodejs';

import path from 'path';
import { stat, readFile } from 'fs/promises';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

function sse(data: unknown) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  const file = searchParams.get('file');
  const type = searchParams.get('type') || 'both'; // 'jsdoc' | 'readme' | 'both'

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
        const ext = path.extname(relFile);
        const isTsx = ext === '.tsx' || ext === '.jsx';

        emit({ phase: 'analyzing', message: 'Writing documentation…' });

        let systemPrompt: string;
        let userMessage: string;

        if (type === 'jsdoc') {
          systemPrompt = `You are an expert TypeScript/JavaScript developer writing JSDoc documentation.
Add JSDoc comments to every exported function, class, interface, type, and React component in the file.
- Use /** ... */ style comments
- Include @param tags with types and descriptions for every parameter
- Include @returns tag describing the return value
- Include @example tag with a brief usage example for complex functions
- For React components, document props with @param props and individual prop descriptions
- Preserve ALL existing code exactly — only add/update JSDoc comments
- Return the COMPLETE file with JSDoc comments added — no explanation, no markdown fences, just the raw code`;

          userMessage = `Add JSDoc documentation to every exported symbol in this file: \`${relFile}\`

\`\`\`${isTsx ? 'tsx' : 'ts'}
${sourceContent.slice(0, 15000)}
\`\`\`

Return the complete file with JSDoc comments added.`;

        } else if (type === 'readme') {
          systemPrompt = `You are a technical writer creating README documentation for a code module.
Write a clear, well-structured README section for the given file.
Include:
1. **Overview** — what this module does and why it exists
2. **Exports** — table or list of all exported symbols with brief descriptions
3. **Usage Examples** — 2-3 realistic code examples showing common use cases
4. **Props/Parameters** — for React components, document all props with types
5. **Notes** — any important caveats, side effects, or dependencies

Use markdown. Be concise but complete. Return ONLY the markdown — no preamble.`;

          userMessage = `Write a README documentation section for this file: \`${relFile}\`

\`\`\`${isTsx ? 'tsx' : 'ts'}
${sourceContent.slice(0, 15000)}
\`\`\``;

        } else {
          // both — ask Claude to produce both sections clearly delimited
          systemPrompt = `You are an expert developer writing comprehensive documentation.
Produce TWO sections separated by the delimiter "---README---":

SECTION 1 (before ---README---): The complete source file with JSDoc comments added to every exported symbol.
- Use /** ... */ style comments with @param, @returns, @example tags
- Preserve ALL existing code exactly
- Return raw TypeScript/TSX code, no markdown fences

SECTION 2 (after ---README---): A README.md section for this module in markdown.
- Include: Overview, Exports table, Usage Examples, Notes
- Use markdown headings and code blocks

Return ONLY these two sections with ---README--- between them, nothing else.`;

          userMessage = `Document this file: \`${relFile}\`

\`\`\`${isTsx ? 'tsx' : 'ts'}
${sourceContent.slice(0, 12000)}
\`\`\``;
        }

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

        // Parse dual output if 'both'
        let jsdocOutput: string | undefined;
        let readmeOutput: string | undefined;

        if (type === 'both') {
          const delimiter = '---README---';
          const idx = fullText.indexOf(delimiter);
          if (idx !== -1) {
            jsdocOutput = fullText.slice(0, idx).trim()
              .replace(/^```(?:\w+)?\n?/m, '').replace(/\n?```$/m, '').trim();
            readmeOutput = fullText.slice(idx + delimiter.length).trim();
          } else {
            jsdocOutput = fullText.trim()
              .replace(/^```(?:\w+)?\n?/m, '').replace(/\n?```$/m, '').trim();
          }
        } else if (type === 'jsdoc') {
          jsdocOutput = fullText.trim()
            .replace(/^```(?:\w+)?\n?/m, '').replace(/\n?```$/m, '').trim();
        } else {
          readmeOutput = fullText.trim();
        }

        const output = type === 'both'
          ? (jsdocOutput || '') + (readmeOutput ? `\n\n---README---\n\n${readmeOutput}` : '')
          : fullText.trim();

        emit({
          phase: 'complete',
          output,
          jsdocOutput,
          readmeOutput,
          file: relFile,
          type,
          suggestedFilename: type === 'readme' ? 'README.md' : relFile,
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
