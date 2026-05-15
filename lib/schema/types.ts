export interface SchemaField {
  name: string;
  type: string;          // String, Int, Boolean, DateTime, Json, etc.
  isOptional: boolean;   // ends with ?
  isPrimary: boolean;    // @id
  isUnique: boolean;     // @unique
  isRelation: boolean;   // references another model
  relatedModel?: string; // model it points to
  isList: boolean;       // array field (e.g. Post[])
  defaultValue?: string; // @default(...)
  attributes: string[];  // raw @xxx attributes
}

export interface SchemaModel {
  name: string;
  fields: SchemaField[];
  // Derived convenience
  primaryKey?: string;
  relations: SchemaRelation[];
}

export interface SchemaRelation {
  fromModel: string;
  fromField: string;
  toModel: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
}

export interface ParsedSchema {
  models: SchemaModel[];
  relations: SchemaRelation[];
  source: 'prisma' | 'sql' | 'unknown';
  schemaFile: string;
}

// For the data view
export interface TableInfo {
  name: string;
  rowCount: number;
  columns: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  pk: boolean;
  dfltValue: string | null;
}

export interface TableData {
  table: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DatabaseInfo {
  file: string;
  tables: TableInfo[];
}
