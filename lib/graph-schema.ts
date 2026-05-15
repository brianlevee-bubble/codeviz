import { z } from 'zod';

const NodeTypeEnum = z.enum([
  'Component',
  'PageRoute',
  'APIEndpoint',
  'Database',
  'ExternalService',
  'State',
  'Utility',
]);

const EdgeTypeEnum = z.enum(['renders', 'calls', 'dataFlow', 'reads', 'writes']);

const GraphNodeDataSchema = z.object({
  label: z.string(),
  nodeType: NodeTypeEnum,
  file: z.string().optional(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
  description: z.string().optional(),
  props: z.array(z.string()).optional(),
  methods: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const GraphNodeSchema = z.object({
  id: z.string(),
  type: NodeTypeEnum,
  position: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  data: GraphNodeDataSchema,
});

const GraphEdgeDataSchema = z.object({
  edgeType: EdgeTypeEnum,
  label: z.string().optional(),
  dataShape: z.string().optional(),
});

const GraphEdgeSchema = z.object({
  id: z.string(),
  type: EdgeTypeEnum,
  source: z.string(),
  target: z.string(),
  data: GraphEdgeDataSchema,
  animated: z.boolean().optional(),
  label: z.string().optional(),
});

const ViewSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export const GraphDataSchema = z.object({
  projectName: z.string(),
  analysisTimestamp: z.string().default(() => new Date().toISOString()),
  views: z.object({
    architecture: ViewSchema,
    dataFlow: ViewSchema,
    stateMachine: ViewSchema,
    permissions: ViewSchema,
  }),
});

export type ValidatedGraphData = z.infer<typeof GraphDataSchema>;

export function parseClaudeGraphOutput(raw: string): ValidatedGraphData {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');

  const parsed = JSON.parse(cleaned);
  return GraphDataSchema.parse(parsed);
}
