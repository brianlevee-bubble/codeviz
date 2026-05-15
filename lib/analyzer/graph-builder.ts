import { parseClaudeGraphOutput } from '@/lib/graph-schema';
import { applyDagreLayout } from '@/lib/layout/dagre-layout';
import type { GraphData, GraphNode, GraphEdge } from '@/lib/types';

export function buildGraphData(rawOutput: string): GraphData {
  const validated = parseClaudeGraphOutput(rawOutput);

  // Process each view
  const views = Object.fromEntries(
    Object.entries(validated.views).map(([viewKey, viewData]) => {
      const nodes = viewData.nodes as GraphNode[];
      const edges = viewData.edges as GraphEdge[];

      // Deduplicate node IDs
      const seenIds = new Set<string>();
      const uniqueNodes = nodes.filter((n) => {
        if (seenIds.has(n.id)) return false;
        seenIds.add(n.id);
        return true;
      });

      // Remove edges referencing non-existent nodes
      const nodeIds = new Set(uniqueNodes.map((n) => n.id));
      const validEdges = edges.filter(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target) && e.source !== e.target
      );

      // Deduplicate edges (same source+target+type)
      const seenEdges = new Set<string>();
      const uniqueEdges = validEdges.filter((e) => {
        const key = `${e.source}→${e.target}→${e.type}`;
        if (seenEdges.has(key)) return false;
        seenEdges.add(key);
        return true;
      });

      // Apply dagre layout
      const direction = viewKey === 'stateMachine' ? 'TB' : 'LR';
      const laidOutNodes = applyDagreLayout(uniqueNodes, uniqueEdges, direction);

      return [viewKey, { nodes: laidOutNodes, edges: uniqueEdges }];
    })
  ) as GraphData['views'];

  return {
    projectName: validated.projectName,
    analysisTimestamp: validated.analysisTimestamp,
    views,
  };
}
