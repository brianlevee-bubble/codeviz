import type { PendingChange, CodeOperation, GraphData } from '@/lib/types';

function findNodeFile(graphData: GraphData, nodeId: string): string | null {
  for (const view of Object.values(graphData.views)) {
    const node = view.nodes.find((n) => n.id === nodeId);
    if (node?.data.file) return node.data.file;
  }
  return null;
}

function findNodeLabel(graphData: GraphData, nodeId: string): string | null {
  for (const view of Object.values(graphData.views)) {
    const node = view.nodes.find((n) => n.id === nodeId);
    if (node) return node.data.label;
  }
  return null;
}

export function mapChangesToOperations(
  changes: PendingChange[],
  graphData: GraphData
): CodeOperation[] {
  const ops: CodeOperation[] = [];

  for (const change of changes) {
    switch (change.changeType) {
      case 'node_renamed': {
        const file = change.nodeId ? findNodeFile(graphData, change.nodeId) : null;
        const oldLabel = change.before.label ?? '';
        const newLabel = change.after.label ?? '';
        if (!oldLabel || !newLabel || oldLabel === newLabel) break;

        ops.push({
          type: 'rename_component',
          description: `Rename "${oldLabel}" to "${newLabel}"`,
          targetFile: file ?? '*',
          params: { oldName: oldLabel, newName: newLabel, file: file ?? '' },
        });
        break;
      }

      case 'node_data_updated': {
        const file = change.nodeId ? findNodeFile(graphData, change.nodeId) : null;
        const label = findNodeLabel(graphData, change.nodeId ?? '');
        if (!file) break;

        ops.push({
          type: 'free_form',
          description: `Update metadata for "${label}" in ${file}`,
          targetFile: file,
          params: {
            nodeId: change.nodeId ?? '',
            changes: JSON.stringify(change.after),
          },
        });
        break;
      }

      case 'node_deleted': {
        const file = change.before.file;
        const label = change.before.label ?? change.nodeId ?? 'node';
        if (file) {
          ops.push({
            type: 'delete_file',
            description: `Delete file for "${label}"`,
            targetFile: file,
            params: { label },
          });
        } else {
          ops.push({
            type: 'free_form',
            description: `Remove "${label}" from codebase`,
            targetFile: '*',
            params: { label, nodeId: change.nodeId ?? '' },
          });
        }
        break;
      }

      case 'node_added': {
        const nodeType = change.after.nodeType ?? 'Component';
        const label = change.after.label ?? 'NewNode';
        const ext = nodeType === 'Utility' ? '.ts' : '.tsx';
        const fileName = label.replace(/\s+/g, '') + ext;
        ops.push({
          type: 'create_file',
          description: `Create new ${nodeType} "${label}"`,
          targetFile: fileName,
          params: { nodeType, label },
        });
        break;
      }

      case 'edge_added': {
        const sourceFile = change.after.source
          ? findNodeFile(graphData, change.after.source as string)
          : null;
        const sourceLabel = change.after.source
          ? findNodeLabel(graphData, change.after.source as string)
          : change.after.source;
        const targetLabel = change.after.target
          ? findNodeLabel(graphData, change.after.target as string)
          : change.after.target;

        ops.push({
          type: 'free_form',
          description: `Connect "${sourceLabel}" to "${targetLabel}" (${change.after.edgeType})`,
          targetFile: sourceFile ?? '*',
          params: {
            source: sourceLabel ?? '',
            target: targetLabel ?? '',
            edgeType: (change.after.edgeType as string) ?? 'calls',
          },
        });
        break;
      }

      case 'edge_deleted': {
        // Edge deletions don't require code changes — skip
        break;
      }

      case 'role_added': {
        const role = change.metadata?.role as string | undefined;
        if (!role) break;
        ops.push({
          type: 'free_form',
          description: `Add new role "${role}" to the codebase`,
          targetFile: '*',
          params: {
            role,
            instruction:
              `Add a new role "${role}" to the application. ` +
              'Find where roles are defined (enums, constants, middleware, auth config) and add this new role. ' +
              'Match the existing pattern for how roles are declared and checked. ' +
              'Do not grant this role access to any resources by default.',
          },
        });
        break;
      }

      case 'role_renamed': {
        const role = change.metadata?.role as string | undefined;
        const newName = change.metadata?.newName as string | undefined;
        if (!role || !newName || role === newName) break;
        ops.push({
          type: 'free_form',
          description: `Rename role "${role}" to "${newName}" throughout the codebase`,
          targetFile: '*',
          params: {
            oldRole: role,
            newRole: newName,
            instruction:
              `Rename the role "${role}" to "${newName}" everywhere it appears — ` +
              'role definitions, middleware checks, permission guards, seeder data, and any string literals or enums. ' +
              'Do a thorough rename across all files.',
          },
        });
        break;
      }

      case 'role_deleted': {
        const role = change.metadata?.role as string | undefined;
        if (!role) break;
        ops.push({
          type: 'free_form',
          description: `Remove role "${role}" from the codebase`,
          targetFile: '*',
          params: {
            role,
            instruction:
              `Remove the role "${role}" from the application. ` +
              'Delete its definition from role enums/constants, remove any permission checks specific to this role, ' +
              'and clean up any references. Do not remove shared auth logic used by other roles.',
          },
        });
        break;
      }

      case 'permission_change': {
        const m = change.metadata as {
          role: string;
          resourceLabel: string;
          resourceFile: string;
          resourceRoute?: string;
          grant: boolean;
        } | undefined;
        if (!m) break;

        const action = m.grant ? 'Grant' : 'Revoke';
        const direction = m.grant
          ? `allow the "${m.role}" role to access it`
          : `deny the "${m.role}" role from accessing it`;

        ops.push({
          type: 'free_form',
          description: `${action} "${m.role}" access to "${m.resourceLabel}"${m.resourceRoute ? ` (${m.resourceRoute})` : ''}`,
          targetFile: m.resourceFile,
          params: {
            sourceFile: m.resourceFile,
            role: m.role,
            resourceLabel: m.resourceLabel,
            ...(m.resourceRoute ? { route: m.resourceRoute } : {}),
            grant: String(m.grant),
            instruction:
              `In "${m.resourceFile}", find the auth/permission check for "${m.resourceLabel}"` +
              (m.resourceRoute ? ` at route "${m.resourceRoute}"` : '') +
              ` and modify it to ${direction}. ` +
              'Preserve all existing role checks for other roles. ' +
              'Match the existing auth pattern used in the file (middleware, getServerSession, requireRole, etc.). ' +
              'Do not change any other behavior.',
          },
        });
        break;
      }

      case 'style_change': {
        const element = change.metadata?.element as {
          tagName: string;
          id: string | null;
          className: string;
          outerHTMLSnippet: string;
          pageUrl: string;
          ancestors: unknown[];
          reactSource?: { fileName: string; lineNumber: number | null; componentName: string | null } | null;
        } | undefined;

        if (!element) break;

        const styleChanges = Object.entries(change.after)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');

        const rs = element.reactSource;
        // Keep targetFile as '*' — file resolution happens in claude-editor using sourceFile param
        const targetFile = '*';

        ops.push({
          type: 'free_form',
          description: `Update styles on <${element.tagName}>${rs?.componentName ? ` in ${rs.componentName}` : ''}: ${styleChanges}`,
          targetFile,
          params: {
            elementTagName: element.tagName,
            elementId: element.id ?? '',
            elementClassName: element.className,
            outerHTMLSnippet: element.outerHTMLSnippet,
            ...(rs?.fileName ? { sourceFile: rs.fileName } : {}),
            ...(rs?.lineNumber ? { sourceLine: String(rs.lineNumber) } : {}),
            ...(rs?.componentName ? { componentName: rs.componentName } : {}),
            styleChanges: JSON.stringify(change.after),
            instruction:
              (rs?.fileName && rs?.lineNumber
                ? `The element is defined in "${rs.fileName}" near line ${rs.lineNumber}${rs.componentName ? ` in the ${rs.componentName} component` : ''}. ` +
                  `Go to that line and find the JSX element with className="${element.className}". `
                : `Find the EXACT JSX element whose className is "${element.className}". ` +
                  `The rendered HTML is: ${element.outerHTMLSnippet}. `) +
              'Apply the style changes to ONLY that specific element. ' +
              'If Tailwind CSS: translate each style change to the correct Tailwind utility class, replacing conflicting classes. ' +
              'If CSS modules: update only the matching rule. ' +
              'If inline styles: update the style prop. ' +
              'Do not modify any other element.',
          },
        });
        break;
      }
    }
  }

  return ops;
}

export function buildCodeChangePrompt(
  operations: CodeOperation[],
  fileContents: Record<string, string>
): string {
  const parts: string[] = [];

  parts.push(
    'Apply the following code operations to the provided files.\n' +
    'Return ONLY a JSON object with this exact shape:\n' +
    '{ "files": [ { "path": "relative/path", "content": "full new file content" } ] }\n' +
    'Include ONLY files that actually need to change. Return the complete new content for each modified file.\n' +
    'For deletions, include the file with content set to null.\n' +
    'For new files, return the generated content.\n' +
    'Return ONLY the JSON, no markdown fences.\n'
  );

  parts.push('\n=== OPERATIONS ===');
  operations.forEach((op, i) => {
    parts.push(`${i + 1}. [${op.type}] ${op.description}`);
    if (Object.keys(op.params).length > 0) {
      parts.push(`   Params: ${JSON.stringify(op.params)}`);
    }
  });

  if (Object.keys(fileContents).length > 0) {
    parts.push('\n=== CURRENT FILE CONTENTS ===');
    for (const [path, content] of Object.entries(fileContents)) {
      parts.push(`\n--- ${path} ---\n${content}`);
    }
  }

  return parts.join('\n');
}
