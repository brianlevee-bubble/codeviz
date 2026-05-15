export type ExportCategory = 'Component' | 'Function' | 'Type' | 'Constant' | 'Class' | 'Default' | 'Unknown';
export type DeadCodeSafety = 'safe_to_delete' | 'needs_review' | 'external_api';

export interface ExportedSymbol {
  id: string;               // `${relativePath}::${name}`
  name: string;
  category: ExportCategory;
  file: string;             // relative path
  line: number;
  exportLine: string;       // the actual export statement, max 120 chars
  isDefaultExport: boolean;
  safety: DeadCodeSafety;
  safetyReason: string;
}

export interface DeadCodeReport {
  deadExports: ExportedSymbol[];
  stats: {
    totalExports: number;
    deadExports: number;
    byCategory: Record<string, number>;
    bySafety: Record<string, number>;
    mostAffectedFile: string;
  };
}
