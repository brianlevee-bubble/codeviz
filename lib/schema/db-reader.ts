import Database from 'better-sqlite3';
import type { TableInfo, ColumnInfo, TableData, DatabaseInfo } from './types';

const PAGE_SIZE = 50;

export function getDatabaseInfo(dbPath: string): DatabaseInfo {
  const db = new Database(dbPath, { readonly: true });

  try {
    // Get all non-system tables
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name`
      )
      .all() as { name: string }[];

    const tableInfos: TableInfo[] = tables.map(({ name }) => {
      const count = (db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get() as { c: number }).c;
      const columns = db.prepare(`PRAGMA table_info("${name}")`).all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: string | null;
      }>;

      return {
        name,
        rowCount: count,
        columns: columns.map((c) => ({
          name: c.name,
          type: c.type,
          notNull: c.notnull === 1,
          pk: c.pk === 1,
          dfltValue: c.dflt_value,
        })),
      };
    });

    return { file: dbPath, tables: tableInfos };
  } finally {
    db.close();
  }
}

export function getTableData(dbPath: string, table: string, page = 1): TableData {
  const db = new Database(dbPath, { readonly: true });

  try {
    // Validate table name (prevent SQL injection via identifier)
    const validTables = (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
        .all() as { name: string }[]
    ).map((r) => r.name);

    if (!validTables.includes(table)) {
      throw new Error(`Table "${table}" not found`);
    }

    const total = (db.prepare(`SELECT COUNT(*) as c FROM "${table}"`).get() as { c: number }).c;
    const offset = (page - 1) * PAGE_SIZE;

    const rows = db
      .prepare(`SELECT * FROM "${table}" LIMIT ${PAGE_SIZE} OFFSET ${offset}`)
      .all() as Record<string, unknown>[];

    const columns =
      rows.length > 0
        ? Object.keys(rows[0])
        : (
            db.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]
          ).map((c) => c.name);

    // Truncate very long values for display
    const truncatedRows = rows.map((row) => {
      const r: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'string' && v.length > 200) {
          r[k] = v.slice(0, 200) + '…';
        } else {
          r[k] = v;
        }
      }
      return r;
    });

    return { table, columns, rows: truncatedRows, total, page, pageSize: PAGE_SIZE };
  } finally {
    db.close();
  }
}
