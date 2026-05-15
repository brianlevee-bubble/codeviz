import Anthropic from '@anthropic-ai/sdk';
import type { ChunkedContext } from './chunker';
import { buildAnalysisPrompt } from './chunker';

const client = new Anthropic();

// Keep descriptions and props short — the JSON response can get very large
const SYSTEM_PROMPT = `You are a code architecture analyzer. Analyze the provided codebase and return ONLY a valid JSON object — no markdown, no explanation, no code fences, just raw JSON.

The JSON must match this exact schema:
{
  "projectName": "string (derive from package.json name or directory name)",
  "analysisTimestamp": "string (ISO 8601)",
  "views": {
    "architecture": { "nodes": [...], "edges": [...] },
    "dataFlow": { "nodes": [...], "edges": [...] },
    "stateMachine": { "nodes": [...], "edges": [...] },
    "permissions": { "nodes": [...], "edges": [...] }
  }
}

Node schema:
{
  "id": "string (snake_case, unique)",
  "type": "Component|PageRoute|APIEndpoint|Database|ExternalService|State|Utility",
  "position": { "x": 0, "y": 0 },
  "data": {
    "label": "string (human-readable name, max 30 chars)",
    "nodeType": "same as type field",
    "file": "string (relative file path, optional)",
    "description": "string (max 60 chars, optional)",
    "tags": ["string"] (optional, e.g. auth, public, admin)
  }
}

Edge schema:
{
  "id": "string (unique)",
  "type": "renders|calls|dataFlow|reads|writes",
  "source": "string (valid node id)",
  "target": "string (valid node id)",
  "data": {
    "edgeType": "same as type field",
    "label": "string (max 20 chars, optional)"
  }
}

IMPORTANT RULES:
- Every node id must be snake_case and unique within each view
- Every edge source and target must reference a node id that exists in the SAME view
- All positions should be { "x": 0, "y": 0 }
- Keep descriptions short (under 60 chars) to avoid token limits
- Omit "props", "methods", "lineStart", "lineEnd", "dataShape" — not needed
- LIMIT: max 15 nodes and 20 edges per view — focus on the most important parts
- Complete the entire JSON — do not truncate

View guidance:
- architecture: Major components, pages, services, databases and their relationships
- dataFlow: How data moves — API calls, state reads/writes, external service calls
- stateMachine: State stores and the events/actions that change them
- permissions: Auth middleware, guards, which routes require which roles; minimal if no auth`;

const CONCISE_SUFFIX = `\n\nIMPORTANT: This codebase is large. Be very concise — max 10 nodes per view, no descriptions needed. Focus only on the top-level architecture.`;

export async function analyzeCodebase(
  context: ChunkedContext,
  rootPath: string,
  onToken: (token: string) => void,
  concise = false
): Promise<string> {
  const userMessage = buildAnalysisPrompt(context, rootPath);
  const systemPrompt = concise ? SYSTEM_PROMPT + CONCISE_SUFFIX : SYSTEM_PROMPT;

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  let fullText = '';
  let stopped = false;

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      onToken(event.delta.text);
    }
    if (event.type === 'message_delta' && event.delta.stop_reason === 'max_tokens') {
      stopped = true;
    }
  }

  if (stopped) {
    throw new Error('TRUNCATED');
  }

  return fullText;
}
