'use client';

import { useEffect, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, Key, Link, Hash, Calendar, ToggleLeft, FileText } from 'lucide-react';
import type { ParsedSchema, SchemaField, SchemaModel } from '@/lib/schema/types';

const TYPE_COLORS: Record<string, string> = {
  String: 'text-green-600',
  Int: 'text-blue-600',
  BigInt: 'text-blue-600',
  Float: 'text-blue-600',
  Decimal: 'text-blue-600',
  Boolean: 'text-orange-600',
  DateTime: 'text-purple-600',
  Json: 'text-yellow-600',
  Bytes: 'text-slate-600',
};

function TypeIcon({ field }: { field: SchemaField }) {
  if (field.isPrimary) return <Key className="h-3 w-3 text-yellow-500" />;
  if (field.isRelation) return <Link className="h-3 w-3 text-blue-400" />;
  if (field.type === 'DateTime') return <Calendar className="h-3 w-3 text-purple-400" />;
  if (field.type === 'Boolean') return <ToggleLeft className="h-3 w-3 text-orange-400" />;
  if (['Int', 'Float', 'Decimal', 'BigInt'].includes(field.type)) return <Hash className="h-3 w-3 text-blue-400" />;
  return <FileText className="h-3 w-3 text-slate-400" />;
}

function ModelCard({ model }: { model: SchemaModel }) {
  const [expanded, setExpanded] = useState(true);
  const scalarFields = model.fields.filter((f) => !f.isRelation && !f.isList);
  const relationFields = model.fields.filter((f) => f.isRelation || f.isList);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-w-[240px]">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 hover:bg-slate-100 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 text-sm">{model.name}</span>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {scalarFields.length} fields
          </Badge>
        </div>
        <span className="text-slate-400 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-50">
          {/* Scalar fields */}
          {scalarFields.map((field) => (
            <div key={field.name} className="flex items-center gap-2 px-4 py-1.5 hover:bg-slate-50">
              <TypeIcon field={field} />
              <span
                className={`text-xs font-mono font-medium ${field.isPrimary ? 'text-yellow-700' : 'text-slate-700'}`}
              >
                {field.name}
              </span>
              <span className={`text-xs ml-auto font-mono ${TYPE_COLORS[field.type] ?? 'text-slate-500'}`}>
                {field.type}{field.isOptional ? '?' : ''}
              </span>
              {field.isUnique && !field.isPrimary && (
                <span className="text-[9px] bg-indigo-50 text-indigo-500 px-1 rounded">U</span>
              )}
            </div>
          ))}

          {/* Relation fields */}
          {relationFields.length > 0 && (
            <>
              <div className="px-4 py-1 bg-blue-50/50">
                <span className="text-[10px] font-medium text-blue-500 uppercase tracking-wide">Relations</span>
              </div>
              {relationFields.map((field) => (
                <div key={field.name} className="flex items-center gap-2 px-4 py-1.5 bg-blue-50/30 hover:bg-blue-50">
                  <Link className="h-3 w-3 text-blue-400 shrink-0" />
                  <span className="text-xs font-mono text-slate-600">{field.name}</span>
                  <span className="text-xs text-blue-500 ml-auto font-mono">
                    {field.type}{field.isList ? '[]' : ''}{field.isOptional ? '?' : ''}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function SchemaView() {
  const { directoryPath } = useGraphStore();
  const [schema, setSchema] = useState<ParsedSchema | null>(null);
  const [dbFile, setDbFile] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!directoryPath) return;
    setLoading(true);
    setError('');

    fetch(`/api/schema?path=${encodeURIComponent(directoryPath)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setSchema(data.schema);
          setDbFile(data.schema.schemaFile);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [directoryPath]);

  if (loading) {
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
        <p className="text-sm text-slate-500">{error}</p>
      </div>
    );
  }

  if (!schema) return null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Header bar */}
      <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700">
          {schema.models.length} models
        </span>
        <span className="text-slate-300">·</span>
        <span className="text-xs text-slate-500 font-mono">{dbFile}</span>
        <span className="text-slate-300">·</span>
        <Badge variant="outline" className="text-[10px]">{schema.source}</Badge>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {schema.models.map((model) => (
              <ModelCard key={model.name} model={model} />
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
