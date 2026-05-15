export type QueryType = 'prisma' | 'sql' | 'fetch' | 'trpc' | 'supabase' | 'other';

export interface DataList {
  id: string;
  /** Human-readable name, e.g. "Team Members" */
  name: string;
  /** What the list represents */
  description: string;
  /** File where this query lives, relative to project root */
  file: string;
  /** The actual query/fetch code */
  query: string;
  queryType: QueryType;
  /** DB models/tables touched */
  tables: string[];
  /** Human-readable filter descriptions, e.g. ["current user's teams"] */
  filters: string[];
  sort?: string;
  limit?: number;
  isPaginated?: boolean;
}

export interface PageQueries {
  id: string;
  route: string;
  file: string;
  label: string;
  lists: DataList[];
}

export interface QueriesGraph {
  pages: PageQueries[];
}
