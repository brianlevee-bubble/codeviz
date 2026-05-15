export type AgentId = 'test-writer' | 'changelog' | 'reviewer' | 'doc-writer';
export type OutputFormat = 'code' | 'markdown';
export type RunStatus = 'idle' | 'scanning' | 'analyzing' | 'done' | 'error';

export interface AgentDef {
  id: AgentId;
  label: string;
  icon: string;
  tagline: string;
  outputFormat: OutputFormat;
  outputLabel: string;
}

export interface AgentRun {
  id: string;           // `${agentId}_${Date.now()}`
  agentId: AgentId;
  label: string;        // e.g. "components/Button.tsx → tests"
  output: string;
  ranAt: string;        // ISO date
  status: 'done' | 'error';
}

export type AgentHistory = Record<AgentId, AgentRun[]>;

export const AGENTS: AgentDef[] = [
  {
    id: 'test-writer',
    label: 'Test Writer',
    icon: '✍️',
    tagline: 'Generate a complete test file for any source file',
    outputFormat: 'code',
    outputLabel: 'Test file',
  },
  {
    id: 'changelog',
    label: 'Changelog',
    icon: '📋',
    tagline: 'Turn git commits into readable release notes',
    outputFormat: 'markdown',
    outputLabel: 'Release notes',
  },
  {
    id: 'reviewer',
    label: 'Code Reviewer',
    icon: '🔍',
    tagline: 'Deep review for bugs, security, and performance',
    outputFormat: 'markdown',
    outputLabel: 'Review report',
  },
  {
    id: 'doc-writer',
    label: 'Doc Writer',
    icon: '📖',
    tagline: 'Write JSDoc comments and README sections',
    outputFormat: 'code',
    outputLabel: 'Documentation',
  },
];
