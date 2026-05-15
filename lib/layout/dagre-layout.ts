import dagre from '@dagrejs/dagre';
import type { GraphNode, GraphEdge, NodeType } from '@/lib/types';

const NODE_DIMS: Record<NodeType, { width: number; height: number }> = {
  Component: { width: 180, height: 60 },
  PageRoute: { width: 200, height: 70 },
  APIEndpoint: { width: 200, height: 60 },
  Database: { width: 160, height: 80 },
  ExternalService: { width: 180, height: 70 },
  State: { width: 160, height: 60 },
  Utility: { width: 150, height: 50 },
};

const DEFAULT_DIMS = { width: 180, height: 60 };

export function applyDagreLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  direction: 'TB' | 'LR' = 'LR'
): GraphNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 140,
    marginx: 60,
    marginy: 60,
  });

  nodes.forEach((n) => {
    const dims = NODE_DIMS[n.data.nodeType as NodeType] ?? DEFAULT_DIMS;
    g.setNode(n.id, { ...dims });
  });

  edges.forEach((e) => {
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  });

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    if (!pos) return n;
    const dims = NODE_DIMS[n.data.nodeType as NodeType] ?? DEFAULT_DIMS;
    return {
      ...n,
      position: {
        x: pos.x - dims.width / 2,
        y: pos.y - dims.height / 2,
      },
    };
  });
}
