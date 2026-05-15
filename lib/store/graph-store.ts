import { create } from 'zustand';
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  GraphNodeData,
  DiagramView,
  CanvasTab,
  NodeType,
  EdgeType,
  PendingChange,
  FileDiff,
  AnalysisPhase,
  StyleChangeElement,
} from '@/lib/types';
import type { AnalysisId, AnalysisStatus } from '@/lib/analyze-all';

let changeIdCounter = 0;
function nextChangeId() {
  return `change_${++changeIdCounter}`;
}

interface GraphStore {
  // Project state
  directoryPath: string | null;
  graphData: GraphData | null;
  activeView: DiagramView;
  activeTab: CanvasTab;
  analysisPhase: AnalysisPhase;
  analysisMessage: string;
  analysisTokens: string;

  // Canvas state
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  // Pending changes
  pendingChanges: PendingChange[];

  // Apply flow
  previewDiffs: FileDiff[] | null;
  isDiffLoading: boolean;
  isApplying: boolean;

  // Actions
  setDirectoryPath: (path: string) => void;
  setGraphData: (data: GraphData) => void;
  setActiveView: (view: DiagramView) => void;
  setActiveTab: (tab: CanvasTab) => void;
  setAnalysisPhase: (phase: AnalysisPhase, message?: string) => void;
  appendAnalysisToken: (token: string) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;

  // Edit operations (all tracked as pending changes)
  renameNode: (id: string, newLabel: string) => void;
  updateNodeData: (id: string, data: Partial<GraphNodeData>) => void;
  deleteNode: (id: string) => void;
  addNode: (nodeType: NodeType, label: string, position: { x: number; y: number }) => void;
  deleteEdge: (id: string) => void;
  addEdge: (source: string, target: string, edgeType: EdgeType) => void;
  addStyleChange: (element: StyleChangeElement, prop: string, value: string) => void;
  addPermissionChange: (opts: {
    role: string;
    resourceId: string;
    resourceLabel: string;
    resourceFile: string;
    resourceRoute?: string;
    grant: boolean;
  }) => void;
  addRoleChange: (opts: { type: 'role_added' | 'role_renamed' | 'role_deleted'; role: string; newName?: string }) => void;

  // Tab analysis progress
  tabProgress: Partial<Record<AnalysisId, AnalysisStatus>>;
  setTabProgress: (id: AnalysisId, status: AnalysisStatus) => void;

  // Apply flow
  setPreviewDiffs: (diffs: FileDiff[] | null) => void;
  setIsDiffLoading: (v: boolean) => void;
  setIsApplying: (v: boolean) => void;
  clearPendingChanges: () => void;
  reset: () => void;
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  directoryPath: null,
  graphData: null,
  activeView: 'architecture',
  activeTab: 'visual-editor',
  analysisPhase: 'idle',
  analysisMessage: '',
  analysisTokens: '',
  selectedNodeId: null,
  selectedEdgeId: null,
  pendingChanges: [],
  previewDiffs: null,
  isDiffLoading: false,
  isApplying: false,
  tabProgress: {},
  setTabProgress: (id, status) => set(s => ({ tabProgress: { ...s.tabProgress, [id]: status } })),

  setDirectoryPath: (path) => set({ directoryPath: path }),

  setGraphData: (data) =>
    set({ graphData: data, pendingChanges: [], selectedNodeId: null, selectedEdgeId: null }),

  setActiveView: (view) => set({ activeView: view, activeTab: view, selectedNodeId: null, selectedEdgeId: null }),
  setActiveTab: (tab) => {
    const isDiagramView = ['architecture', 'dataFlow', 'stateMachine', 'permissions'].includes(tab);
    set({
      activeTab: tab,
      ...(isDiagramView ? { activeView: tab as DiagramView } : {}),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
  },

  setAnalysisPhase: (phase, message = '') =>
    set({ analysisPhase: phase, analysisMessage: message, analysisTokens: phase === 'analyzing' ? '' : get().analysisTokens }),

  appendAnalysisToken: (token) =>
    set((s) => ({ analysisTokens: s.analysisTokens + token })),

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  renameNode: (id, newLabel) => {
    const { graphData, pendingChanges } = get();
    if (!graphData) return;

    const view = graphData.views[get().activeView];
    const node = view.nodes.find((n) => n.id === id);
    if (!node) return;

    const before = { label: node.data.label };
    const after = { label: newLabel };

    // Apply to all views
    const updatedViews = Object.fromEntries(
      Object.entries(graphData.views).map(([viewKey, viewData]) => [
        viewKey,
        {
          ...viewData,
          nodes: viewData.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, label: newLabel, isModified: true } } : n
          ),
        },
      ])
    ) as GraphData['views'];

    set({
      graphData: { ...graphData, views: updatedViews },
      pendingChanges: [
        ...pendingChanges.filter((c) => !(c.changeType === 'node_renamed' && c.nodeId === id)),
        { id: nextChangeId(), changeType: 'node_renamed', nodeId: id, before, after },
      ],
    });
  },

  updateNodeData: (id, data) => {
    const { graphData, pendingChanges } = get();
    if (!graphData) return;

    const view = graphData.views[get().activeView];
    const node = view.nodes.find((n) => n.id === id);
    if (!node) return;

    const before = { ...node.data };

    const updatedViews = Object.fromEntries(
      Object.entries(graphData.views).map(([viewKey, viewData]) => [
        viewKey,
        {
          ...viewData,
          nodes: viewData.nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...data, isModified: true } } : n
          ),
        },
      ])
    ) as GraphData['views'];

    set({
      graphData: { ...graphData, views: updatedViews },
      pendingChanges: [
        ...pendingChanges,
        { id: nextChangeId(), changeType: 'node_data_updated', nodeId: id, before, after: data },
      ],
    });
  },

  deleteNode: (id) => {
    const { graphData, pendingChanges } = get();
    if (!graphData) return;

    const view = graphData.views[get().activeView];
    const node = view.nodes.find((n) => n.id === id);
    if (!node) return;

    const before = { ...node.data };

    const updatedViews = Object.fromEntries(
      Object.entries(graphData.views).map(([viewKey, viewData]) => [
        viewKey,
        {
          ...viewData,
          nodes: viewData.nodes.filter((n) => n.id !== id),
          edges: viewData.edges.filter((e) => e.source !== id && e.target !== id),
        },
      ])
    ) as GraphData['views'];

    set({
      graphData: { ...graphData, views: updatedViews },
      selectedNodeId: null,
      pendingChanges: [
        ...pendingChanges,
        { id: nextChangeId(), changeType: 'node_deleted', nodeId: id, before, after: {} },
      ],
    });
  },

  addNode: (nodeType, label, position) => {
    const { graphData, pendingChanges, activeView } = get();
    if (!graphData) return;

    const id = `node_${Date.now()}`;
    const newNode: GraphNode = {
      id,
      type: nodeType,
      position,
      data: { label, nodeType, isModified: true },
    };

    const updatedViews = {
      ...graphData.views,
      [activeView]: {
        ...graphData.views[activeView],
        nodes: [...graphData.views[activeView].nodes, newNode],
      },
    };

    set({
      graphData: { ...graphData, views: updatedViews },
      pendingChanges: [
        ...pendingChanges,
        {
          id: nextChangeId(),
          changeType: 'node_added',
          nodeId: id,
          before: {},
          after: { label, nodeType },
        },
      ],
    });
  },

  deleteEdge: (id) => {
    const { graphData, pendingChanges } = get();
    if (!graphData) return;

    const view = graphData.views[get().activeView];
    const edge = view.edges.find((e) => e.id === id);
    if (!edge) return;

    const before = { ...edge.data, source: edge.source, target: edge.target };

    const updatedViews = Object.fromEntries(
      Object.entries(graphData.views).map(([viewKey, viewData]) => [
        viewKey,
        { ...viewData, edges: viewData.edges.filter((e) => e.id !== id) },
      ])
    ) as GraphData['views'];

    set({
      graphData: { ...graphData, views: updatedViews },
      selectedEdgeId: null,
      pendingChanges: [
        ...pendingChanges,
        { id: nextChangeId(), changeType: 'edge_deleted', edgeId: id, before, after: {} },
      ],
    });
  },

  addEdge: (source, target, edgeType) => {
    const { graphData, pendingChanges, activeView } = get();
    if (!graphData) return;

    const id = `edge_${Date.now()}`;
    const newEdge: GraphEdge = {
      id,
      type: edgeType,
      source,
      target,
      data: { edgeType },
    };

    const updatedViews = {
      ...graphData.views,
      [activeView]: {
        ...graphData.views[activeView],
        edges: [...graphData.views[activeView].edges, newEdge],
      },
    };

    set({
      graphData: { ...graphData, views: updatedViews },
      pendingChanges: [
        ...pendingChanges,
        {
          id: nextChangeId(),
          changeType: 'edge_added',
          edgeId: id,
          before: {},
          after: { edgeType, source, target },
        },
      ],
    });
  },

  addStyleChange: (element, prop, value) => {
    const { pendingChanges } = get();
    // Use tagName+id+className as a key to merge style changes for the same element
    const elementKey = `${element.tagName}|${element.id ?? ''}|${element.className}`;
    const existing = pendingChanges.find(
      (c) => c.changeType === 'style_change' && c.metadata?.elementKey === elementKey
    );
    if (existing) {
      // Merge this prop into the existing change
      set({
        pendingChanges: pendingChanges.map((c) =>
          c === existing
            ? { ...c, after: { ...c.after, [prop]: value } }
            : c
        ),
      });
    } else {
      set({
        pendingChanges: [
          ...pendingChanges,
          {
            id: nextChangeId(),
            changeType: 'style_change',
            before: {},
            after: { [prop]: value },
            metadata: {
              elementKey,
              element: {
                tagName: element.tagName,
                id: element.id,
                className: element.className,
                outerHTMLSnippet: element.outerHTMLSnippet,
                pageUrl: element.pageUrl,
                ancestors: element.ancestors,
              },
            },
          },
        ],
      });
    }
  },

  addRoleChange: ({ type, role, newName }) => {
    const { pendingChanges } = get();
    // Replace any prior change for the same role
    const filtered = pendingChanges.filter(
      c => !(['role_added', 'role_renamed', 'role_deleted'].includes(c.changeType)) || c.metadata?.role !== role
    );
    set({
      pendingChanges: [
        ...filtered,
        { id: nextChangeId(), changeType: type, before: {}, after: {}, metadata: { role, newName } },
      ],
    });
  },

  addPermissionChange: ({ role, resourceId, resourceLabel, resourceFile, resourceRoute, grant }) => {
    const { pendingChanges } = get();
    // Replace any prior change for the same role+resource pair
    const filtered = pendingChanges.filter(
      c => !(c.changeType === 'permission_change' && c.metadata?.role === role && c.metadata?.resourceId === resourceId)
    );
    set({
      pendingChanges: [
        ...filtered,
        {
          id: nextChangeId(),
          changeType: 'permission_change',
          before: {},
          after: {},
          metadata: { role, resourceId, resourceLabel, resourceFile, resourceRoute, grant },
        },
      ],
    });
  },

  setPreviewDiffs: (diffs) => set({ previewDiffs: diffs }),
  setIsDiffLoading: (v) => set({ isDiffLoading: v }),
  setIsApplying: (v) => set({ isApplying: v }),
  clearPendingChanges: () => set({ pendingChanges: [], previewDiffs: null }),

  reset: () =>
    set({
      graphData: null,
      pendingChanges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      previewDiffs: null,
      analysisPhase: 'idle',
      analysisMessage: '',
      analysisTokens: '',
      activeView: 'architecture',
      activeTab: 'visual-editor',
    }),
}));
