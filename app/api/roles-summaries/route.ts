export const runtime = 'nodejs';

import Anthropic from '@anthropic-ai/sdk';
import type { SecurityGraph, SecuredResource } from '@/lib/security/types';

const client = new Anthropic();

const PUBLIC_ROLE = 'Public';

function resourcesForRole(role: string, resources: SecuredResource[]) {
  if (role === PUBLIC_ROLE) {
    return {
      accessible: resources.filter(r => !r.requiresAuth),
      blocked: resources.filter(r => r.requiresAuth),
    };
  }
  return {
    accessible: resources.filter(r =>
      !r.requiresAuth ||
      r.allowedRoles.length === 0 ||
      r.allowedRoles.some(ar => ar.toLowerCase() === role.toLowerCase())
    ),
    blocked: resources.filter(r =>
      r.requiresAuth &&
      r.allowedRoles.length > 0 &&
      !r.allowedRoles.some(ar => ar.toLowerCase() === role.toLowerCase())
    ),
  };
}

async function summarizeRole(role: string, graph: SecurityGraph): Promise<string> {
  const { accessible, blocked } = resourcesForRole(role, graph.resources);
  const isPublic = role === PUBLIC_ROLE;

  const accessLines = accessible.map(r => {
    const ownership = r.rules.some(ru => ru.type === 'ownership') ? ' (own data only)' : '';
    const fieldFilter = r.rules.find(ru => ru.type === 'field_filter');
    const fields = fieldFilter?.hiddenFields?.length ? ` (fields hidden: ${fieldFilter.hiddenFields.join(', ')})` : '';
    return `  - ${r.label}${r.route ? ` (${r.route})` : ''}${ownership}${fields}`;
  }).join('\n');

  const blockedLines = blocked.slice(0, 5).map(r => `  - ${r.label}`).join('\n');

  const prompt = `You are summarizing access permissions for a "${role}" user role in a web app.
${isPublic ? 'This is the public/unauthenticated user.' : `Role: ${role}`}

Accessible resources (${accessible.length}):
${accessLines || '  (none)'}
${blocked.length > 0 ? `\nBlocked resources (${blocked.length}):\n${blockedLines}${blocked.length > 5 ? `\n  ... and ${blocked.length - 5} more` : ''}` : ''}

Write 1-2 sentences describing what this user can do and any notable restrictions. Be specific and practical. No bullet points, no headers.`;

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    messages: [{ role: 'user', content: prompt }],
  });

  return msg.content[0].type === 'text' ? msg.content[0].text : '';
}

// Client POSTs the security graph (from its localStorage cache) to avoid re-analysis
export async function POST(request: Request) {
  const { graph } = await request.json().catch(() => ({}));

  if (!graph?.resources) {
    return Response.json({ error: 'Missing graph' }, { status: 400 });
  }

  const secGraph = graph as SecurityGraph;
  const allRoles = [PUBLIC_ROLE, ...secGraph.allRoles];
  const summaries: Record<string, string> = {};

  await Promise.all(
    allRoles.map(async role => {
      summaries[role] = await summarizeRole(role, secGraph).catch(() => '');
    })
  );

  return Response.json(summaries);
}
