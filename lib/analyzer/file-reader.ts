import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';
import type { FileTreeNode } from '@/lib/types';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.cache', 'coverage', '.turbo', 'out', '.vercel', '.svelte-kit',
]);

const ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.java', '.cs',
  '.json', '.yaml', '.yml', '.toml', '.env.example',
  '.md', '.mdx', '.txt', '.sql', '.prisma', '.graphql', '.gql',
  '.css', '.scss', '.sass', '.html', '.vue', '.svelte',
]);

const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'bun.lockb', '.DS_Store', 'Thumbs.db',
]);

const MAX_FILE_SIZE = 50 * 1024; // 50KB for content inclusion
const MAX_DEPTH = 10;

export async function walkDirectory(
  rootPath: string,
  options: { maxDepth?: number; contentThreshold?: number } = {}
): Promise<FileTreeNode> {
  const { maxDepth = MAX_DEPTH, contentThreshold = MAX_FILE_SIZE } = options;

  async function walk(dirPath: string, depth: number): Promise<FileTreeNode> {
    const name = path.basename(dirPath);
    const node: FileTreeNode = { name, path: dirPath, type: 'directory', children: [] };

    if (depth > maxDepth) return node;

    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return node;
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        const child = await walk(path.join(dirPath, entry.name), depth + 1);
        node.children!.push(child);
      } else if (entry.isFile()) {
        if (SKIP_FILES.has(entry.name)) continue;
        const ext = path.extname(entry.name).toLowerCase();
        // Allow files with no extension if they look like config (Dockerfile, Makefile, etc.)
        const hasAllowedExt = ALLOWED_EXTENSIONS.has(ext);
        const isConfigFile = !ext && ['Dockerfile', 'Makefile', 'Procfile', 'Gemfile'].includes(entry.name);
        if (!hasAllowedExt && !isConfigFile) continue;

        const filePath = path.join(dirPath, entry.name);
        let fileSize = 0;
        let content: string | undefined;

        try {
          const stats = await stat(filePath);
          fileSize = stats.size;
          if (fileSize <= contentThreshold) {
            content = await readFile(filePath, 'utf-8');
          }
        } catch {
          // skip unreadable files
        }

        node.children!.push({
          name: entry.name,
          path: filePath,
          type: 'file',
          size: fileSize,
          content,
        });
      }
    }

    return node;
  }

  const rootStat = await stat(rootPath);
  if (!rootStat.isDirectory()) {
    throw new Error(`${rootPath} is not a directory`);
  }

  return walk(rootPath, 0);
}

export function flattenTree(tree: FileTreeNode): FileTreeNode[] {
  const files: FileTreeNode[] = [];
  function traverse(node: FileTreeNode) {
    if (node.type === 'file') {
      files.push(node);
    } else {
      for (const child of node.children ?? []) {
        traverse(child);
      }
    }
  }
  traverse(tree);
  return files;
}

export function treeToString(tree: FileTreeNode, indent = 0): string {
  const prefix = '  '.repeat(indent);
  if (tree.type === 'file') {
    const sizeStr = tree.size ? ` (${Math.round(tree.size / 1024)}KB)` : '';
    return `${prefix}${tree.name}${sizeStr}`;
  }
  const lines = [`${prefix}${tree.name}/`];
  for (const child of tree.children ?? []) {
    lines.push(treeToString(child, indent + 1));
  }
  return lines.join('\n');
}

export async function readFileContent(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

export async function readFileSummary(filePath: string, headLines = 100, tailLines = 50): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  if (lines.length <= headLines + tailLines) return content;
  const head = lines.slice(0, headLines);
  const tail = lines.slice(-tailLines);
  return [
    ...head,
    `\n... [${lines.length - headLines - tailLines} lines omitted] ...\n`,
    ...tail,
  ].join('\n');
}
