'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, Database, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DatabaseInfo, TableData } from '@/lib/schema/types';

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    // Detect ISO dates and format nicely
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try {
        return new Date(value).toLocaleString();
      } catch {}
    }
    return value;
  }
  return String(value);
}

function isForeignKey(col: string): boolean {
  return col.endsWith('Id') || col.endsWith('_id');
}

function isPrimaryKey(col: string, value: unknown): boolean {
  return col === 'id' && typeof value === 'string';
}

function CellValue({ col, value }: { col: string; value: unknown }) {
  const formatted = formatCell(value);
  if (value === null || value === undefined) {
    return <span className="text-slate-300 italic text-xs">null</span>;
  }
  if (isPrimaryKey(col, value)) {
    return <span className="text-[10px] font-mono text-yellow-700 bg-yellow-50 px-1 rounded">{formatted}</span>;
  }
  if (isForeignKey(col)) {
    return <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1 rounded">{formatted}</span>;
  }
  if (typeof value === 'boolean') {
    return (
      <span className={cn('text-xs font-medium', value ? 'text-green-600' : 'text-slate-400')}>
        {value ? 'true' : 'false'}
      </span>
    );
  }
  if (typeof value === 'number') {
    return <span className="text-xs text-blue-700 font-mono">{formatted}</span>;
  }
  return <span className="text-xs text-slate-700">{formatted}</span>;
}

export function DataView() {
  const { directoryPath } = useGraphStore();

  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [dbFile, setDbFile] = useState('');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [page, setPage] = useState(1);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [dataError, setDataError] = useState('');

  // Load database info on mount
  useEffect(() => {
    if (!directoryPath) return;
    setLoadingInfo(true);
    setError('');
    fetch(`/api/data?path=${encodeURIComponent(directoryPath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setDbInfo(data.info);
        setDbFile(data.dbFile);
        if (data.info.tables.length > 0) {
          setSelectedTable(data.info.tables[0].name);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingInfo(false));
  }, [directoryPath]);

  // Load table data when table or page changes
  const loadTable = useCallback((table: string, p = 1) => {
    if (!directoryPath) return;
    setLoadingData(true);
    setDataError('');
    fetch(`/api/data?path=${encodeURIComponent(directoryPath)}&table=${encodeURIComponent(table)}&page=${p}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setDataError(data.error); return; }
        setTableData(data.data);
      })
      .catch((e) => setDataError(e.message))
      .finally(() => setLoadingData(false));
  }, [directoryPath]);

  useEffect(() => {
    if (selectedTable) {
      setPage(1);
      loadTable(selectedTable, 1);
    }
  }, [selectedTable, loadTable]);

  function handlePageChange(newPage: number) {
    setPage(newPage);
    if (selectedTable) loadTable(selectedTable, newPage);
  }

  if (loadingInfo) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
        <AlertCircle className="h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-500 max-w-sm">{error}</p>
      </div>
    );
  }

  if (!dbInfo) return null;

  const totalPages = tableData ? Math.ceil(tableData.total / tableData.pageSize) : 0;

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">
      {/* Left sidebar: table list */}
      <div className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-3 py-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs font-medium text-slate-600 truncate">{dbFile}</span>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="py-1">
            {dbInfo.tables.map((t) => (
              <button
                key={t.name}
                onClick={() => setSelectedTable(t.name)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors',
                  selectedTable === t.name
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                <span className="truncate">{t.name}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] px-1.5 py-0 h-4 ml-1 shrink-0',
                    selectedTable === t.name ? 'border-blue-200 text-blue-600' : ''
                  )}
                >
                  {t.rowCount}
                </Badge>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main: data table */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Table header */}
        <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{selectedTable}</span>
          {tableData && (
            <>
              <Badge variant="outline" className="text-xs">
                {tableData.total.toLocaleString()} rows
              </Badge>
              <button
                onClick={() => selectedTable && loadTable(selectedTable, page)}
                className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {loadingData && <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin ml-auto" />}
        </div>

        {dataError && (
          <div className="px-4 py-2 bg-red-50 text-red-600 text-xs border-b border-red-100">{dataError}</div>
        )}

        {/* Scrollable table */}
        {tableData && tableData.columns.length > 0 && (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="text-left px-3 py-2 text-slate-500 font-medium w-10 text-center sticky left-0 bg-slate-100">#</th>
                  {tableData.columns.map((col) => (
                    <th
                      key={col}
                      className="text-left px-3 py-2 text-slate-600 font-medium whitespace-nowrap"
                    >
                      <span
                        className={cn(
                          col === 'id' ? 'text-yellow-700' : isForeignKey(col) ? 'text-blue-600' : ''
                        )}
                      >
                        {col}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-100 hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="px-3 py-1.5 text-slate-300 text-center sticky left-0 bg-white">
                      {(page - 1) * tableData.pageSize + i + 1}
                    </td>
                    {tableData.columns.map((col) => (
                      <td key={col} className="px-3 py-1.5 whitespace-nowrap max-w-[300px] truncate">
                        <CellValue col={col} value={row[col]} />
                      </td>
                    ))}
                  </tr>
                ))}
                {tableData.rows.length === 0 && (
                  <tr>
                    <td colSpan={tableData.columns.length + 1} className="text-center py-12 text-slate-400">
                      No rows in this table
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {tableData && totalPages > 1 && (
          <div className="px-4 py-2.5 bg-white border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Rows {(page - 1) * tableData.pageSize + 1}–
              {Math.min(page * tableData.pageSize, tableData.total)} of {tableData.total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-slate-600 px-2">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 p-0"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
