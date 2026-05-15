'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  MarkerType,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './nodes';
import { edgeTypes } from './edges';
import { useGraphStore } from '@/lib/store/graph-store';
import type { EdgeType } from '@/lib/types';
import { Plus } from 'lucide-react';

const DEFAULT_EDGE_TYPE: EdgeType = 'calls';

interface ContextMenu {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
}

const NODE_TYPE_OPTIONS = [
  { type: 'Component', label: 'Component', color: 'bg-blue-100 text-blue-700' },
  { type: 'PageRoute', label: 'Page / Route', color: 'bg-green-100 text-green-700' },
  { type: 'APIEndpoint', label: 'API Endpoint', color: 'bg-purple-100 text-purple-700' },
  { type: 'Database', label: 'Database', color: 'bg-orange-100 text-orange-700' },
  { type: 'ExternalService', label: 'External Service', color: 'bg-red-100 text-red-700' },
  { type: 'State', label: 'State', color: 'bg-yellow-100 text-yellow-700' },
  { type: 'Utility', label: 'Utility', color: 'bg-slate-100 text-slate-700' },
] as const;

export function FlowCanvas() {
  const {
    graphData,
    activeView,
    selectNode,
    selectEdge,
    addEdge: storeAddEdge,
    addNode,
  } = useGraphStore();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync from store when view or graphData changes
  useEffect(() => {
    if (!graphData) return;
    const view = graphData.views[activeView];
    setNodes(view.nodes as Node[]);
    setEdges(view.edges as Edge[]);
  }, [activeView, graphData, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      storeAddEdge(connection.source, connection.target, DEFAULT_EDGE_TYPE);
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `edge_${Date.now()}`,
            type: DEFAULT_EDGE_TYPE,
            data: { edgeType: DEFAULT_EDGE_TYPE },
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      );
    },
    [storeAddEdge, setEdges]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      selectNode(node.id);
    },
    [selectNode]
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_, edge) => {
      selectEdge(edge.id);
    },
    [selectEdge]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
    setContextMenu(null);
  }, [selectNode, selectEdge]);

  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowX: event.clientX - rect.left,
      flowY: event.clientY - rect.top,
    });
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setContextMenu(null);
    }
  }, []);

  function handleAddNode(nodeType: string) {
    const label = `New ${nodeType}`;
    const position = contextMenu
      ? { x: contextMenu.flowX, y: contextMenu.flowY }
      : { x: 200, y: 200 };
    addNode(nodeType as Parameters<typeof addNode>[0], label, position);
    setContextMenu(null);
  }

  if (!graphData) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Analysis results will appear here
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 relative"
      onKeyDown={onKeyDown}
      tabIndex={0}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{
          type: DEFAULT_EDGE_TYPE,
          markerEnd: { type: MarkerType.ArrowClosed },
          data: { edgeType: DEFAULT_EDGE_TYPE },
        }}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={3}
        className="bg-slate-50"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
        <Controls className="!border-slate-200 !shadow-sm" />
        <MiniMap
          nodeColor={(n) => {
            const colorMap: Record<string, string> = {
              Component: '#bfdbfe',
              PageRoute: '#bbf7d0',
              APIEndpoint: '#e9d5ff',
              Database: '#fed7aa',
              ExternalService: '#fecaca',
              State: '#fef08a',
              Utility: '#e2e8f0',
            };
            return colorMap[n.type ?? ''] ?? '#e2e8f0';
          }}
          className="!border-slate-200 !shadow-sm"
        />

        {/* Add node button in top-right */}
        <Panel position="top-right" className="m-2">
          <button
            onClick={(e) => {
              const rect = containerRef.current?.getBoundingClientRect();
              if (!rect) return;
              setContextMenu({ x: e.clientX, y: e.clientY, flowX: 300, flowY: 200 });
            }}
            className="flex items-center gap-1.5 bg-white border border-slate-200 shadow-sm text-slate-600 text-xs px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add node
          </button>
        </Panel>
      </ReactFlow>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white border border-slate-200 shadow-lg rounded-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs font-medium text-slate-500 border-b border-slate-100">
            Add node
          </div>
          {NODE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => handleAddNode(opt.type)}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
            >
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${opt.color}`}>
                {opt.type.slice(0, 2)}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
