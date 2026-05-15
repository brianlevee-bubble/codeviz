export type ImprovementCategory =
  | 'security'
  | 'performance'
  | 'architecture'
  | 'testing'
  | 'ux'
  | 'data'
  | 'reliability'
  | 'accessibility'
  | 'dx';          // developer experience

export type ImprovementPriority = 'critical' | 'high' | 'medium' | 'low';
export type ImprovementEffort   = 'small' | 'medium' | 'large';

export interface Improvement {
  id: string;
  title: string;
  /** What problem this solves and why it matters */
  description: string;
  category: ImprovementCategory;
  priority: ImprovementPriority;
  effort: ImprovementEffort;
  /** Which tab/dimension surfaced this issue */
  sourceTab: string;
  /** File(s) to change, relative to project root */
  files: string[];
  /** What to look for — the current problematic pattern */
  currentPattern?: string;
  /** Concrete suggestion — what to do instead */
  suggestedChange?: string;
  /** Short code snippet showing the improvement */
  codeExample?: string;
  tags: string[];
}

export interface ImprovementsReport {
  summary: string;          // 1–2 sentence overall assessment
  improvements: Improvement[];
  /** Quick wins: improvements with small effort + high/critical priority */
  quickWinIds: string[];
}
