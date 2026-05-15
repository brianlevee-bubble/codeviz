export type NodeType =
  | 'Component'
  | 'PageRoute'
  | 'APIEndpoint'
  | 'Database'
  | 'ExternalService'
  | 'State'
  | 'Utility';

export type EdgeType = 'renders' | 'calls' | 'dataFlow' | 'reads' | 'writes';

export type DiagramView = 'architecture' | 'dataFlow' | 'stateMachine' | 'permissions';
export type CanvasTab = DiagramView | 'schema' | 'data' | 'ui' | 'tests' | 'features' | 'preview' | 'pages-gallery' | 'queries' | 'security' | 'roles' | 'improvements' | 'api-contracts' | 'dead-code' | 'visual-editor' | 'agents' | 'workflows' | 'timeline' | 'state-inspector' | 'data-flow-primer' | 'integrations' | 'backend-workflows' | 'payments';

export interface GraphNodeData extends Record<string, unknown> {
  label: string;
  nodeType: NodeType;
  file?: string;
  lineStart?: number;
  lineEnd?: number;
  description?: string;
  props?: string[];
  methods?: string[];
  tags?: string[];
  isModified?: boolean;
}

export interface GraphEdgeData extends Record<string, unknown> {
  edgeType: EdgeType;
  label?: string;
  dataShape?: string;
}

export interface GraphNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: GraphNodeData;
}

export interface GraphEdge {
  id: string;
  type: string;
  source: string;
  target: string;
  data: GraphEdgeData;
  animated?: boolean;
  label?: string;
}

export interface ViewData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphData {
  projectName: string;
  analysisTimestamp: string;
  views: Record<DiagramView, ViewData>;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: FileTreeNode[];
  content?: string;
}

export type CodeOperationType =
  | 'rename_component'
  | 'rename_function'
  | 'create_file'
  | 'delete_file'
  | 'add_import'
  | 'remove_import'
  | 'move_file'
  | 'update_prop'
  | 'free_form';

export interface CodeOperation {
  type: CodeOperationType;
  description: string;
  targetFile: string;
  params: Record<string, string | string[]>;
}

export interface FileDiff {
  file: string;
  before: string;
  after: string;
}

export type PendingChangeType =
  | 'node_renamed'
  | 'node_deleted'
  | 'edge_added'
  | 'edge_deleted'
  | 'node_added'
  | 'node_moved'
  | 'node_data_updated'
  | 'style_change'
  | 'permission_change'
  | 'role_added'
  | 'role_renamed'
  | 'role_deleted';

export interface StyleChangeElement {
  tagName: string;
  id: string | null;
  className: string;
  outerHTMLSnippet: string;
  pageUrl: string;
  ancestors: Array<{
    tagName: string;
    id: string | null;
    className: string;
    ariaLabel: string | null;
    role: string | null;
    dataAttrs: Record<string, string>;
  }>;
  reactSource?: {
    fileName: string;
    lineNumber: number | null;
    columnNumber: number | null;
    componentName: string | null;
  } | null;
}

export interface PendingChange {
  id: string;
  changeType: PendingChangeType;
  nodeId?: string;
  edgeId?: string;
  before: Partial<GraphNodeData & GraphEdgeData & { source: string; target: string }>;
  after: Partial<GraphNodeData & GraphEdgeData & { source: string; target: string }>;
  metadata?: Record<string, unknown>;
}

export type AnalysisPhase = 'idle' | 'reading' | 'chunking' | 'analyzing' | 'complete' | 'error';

export interface AnalysisEvent {
  phase: AnalysisPhase;
  message?: string;
  token?: string;
  graph?: GraphData;
  error?: string;
}
