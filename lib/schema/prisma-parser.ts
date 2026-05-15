import type { SchemaField, SchemaModel, SchemaRelation, ParsedSchema } from './types';

// Known scalar types in Prisma
const SCALAR_TYPES = new Set([
  'String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal',
  'DateTime', 'Json', 'Bytes', 'Unsupported',
]);

function parseField(line: string, modelNames: Set<string>): SchemaField | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('@@')) return null;

  // Match: fieldName  TypeName?[]  @attributes...
  const match = trimmed.match(/^(\w+)\s+([\w]+)(\?)?(\[\])?(.*)?$/);
  if (!match) return null;

  const [, name, rawType, optional, list, rest = ''] = match;
  const attrs = rest.trim();

  const isPrimary = attrs.includes('@id');
  const isUnique = attrs.includes('@unique');
  const isRelation = !SCALAR_TYPES.has(rawType) && modelNames.has(rawType);

  // Extract @default(value)
  const defaultMatch = attrs.match(/@default\(([^)]+)\)/);
  const defaultValue = defaultMatch ? defaultMatch[1] : undefined;

  // Extract related model from @relation(fields: [...], references: [...])
  let relatedModel: string | undefined;
  if (isRelation) relatedModel = rawType;

  return {
    name,
    type: rawType,
    isOptional: !!optional,
    isPrimary,
    isUnique,
    isRelation,
    relatedModel,
    isList: !!list,
    defaultValue,
    attributes: attrs
      .split('@')
      .slice(1)
      .map((a) => '@' + a.split('(')[0].trim()),
  };
}

export function parsePrismaSchema(content: string): ParsedSchema {
  const models: SchemaModel[] = [];

  // First pass: collect model names
  const modelNameRegex = /^model\s+(\w+)\s*\{/gm;
  const modelNames = new Set<string>();
  let m;
  while ((m = modelNameRegex.exec(content)) !== null) {
    modelNames.add(m[1]);
  }

  // Second pass: parse each model block
  const modelBlockRegex = /model\s+(\w+)\s*\{([\s\S]+?)\}/g;
  while ((m = modelBlockRegex.exec(content)) !== null) {
    const name = m[1];
    const body = m[2];
    const lines = body.split('\n');

    const fields: SchemaField[] = [];
    for (const line of lines) {
      const field = parseField(line, modelNames);
      if (field) fields.push(field);
    }

    const primaryKey = fields.find((f) => f.isPrimary)?.name;
    models.push({ name, fields, primaryKey, relations: [] });
  }

  // Build relations
  const relations: SchemaRelation[] = [];
  for (const model of models) {
    for (const field of model.fields) {
      if (!field.isRelation || !field.relatedModel) continue;

      // Avoid duplicate relations
      const already = relations.some(
        (r) =>
          (r.fromModel === model.name && r.toModel === field.relatedModel) ||
          (r.fromModel === field.relatedModel && r.toModel === model.name)
      );
      if (!already) {
        const type = field.isList ? 'one-to-many' : 'one-to-one';
        relations.push({
          fromModel: model.name,
          fromField: field.name,
          toModel: field.relatedModel!,
          type,
        });
      }
    }
    model.relations = relations.filter(
      (r) => r.fromModel === model.name || r.toModel === model.name
    );
  }

  return { models, relations, source: 'prisma', schemaFile: '' };
}
