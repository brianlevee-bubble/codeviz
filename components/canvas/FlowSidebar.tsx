'use client';

import { useEffect, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Trash2, ExternalLink, X, Tag } from 'lucide-react';
import type { GraphNodeData, NodeType } from '@/lib/types';

const NODE_TYPE_COLORS: Record<NodeType, string> = {
  Component: 'bg-blue-100 text-blue-700',
  PageRoute: 'bg-green-100 text-green-700',
  APIEndpoint: 'bg-purple-100 text-purple-700',
  Database: 'bg-orange-100 text-orange-700',
  ExternalService: 'bg-red-100 text-red-700',
  State: 'bg-yellow-100 text-yellow-700',
  Utility: 'bg-slate-100 text-slate-700',
};

export function FlowSidebar() {
  const {
    graphData,
    activeView,
    selectedNodeId,
    selectedEdgeId,
    renameNode,
    updateNodeData,
    deleteNode,
    deleteEdge,
    selectNode,
    selectEdge,
    directoryPath,
  } = useGraphStore();

  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const view = graphData?.views[activeView];
  const selectedNode = view?.nodes.find((n) => n.id === selectedNodeId);
  const selectedEdge = view?.edges.find((e) => e.id === selectedEdgeId);

  // Sync local state when selection changes
  useEffect(() => {
    if (selectedNode) {
      setLabel(selectedNode.data.label);
      setDescription(selectedNode.data.description ?? '');
      setTagInput('');
      setConfirmDelete(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id]);

  if (!selectedNode && !selectedEdge) {
    return (
      <div className="w-64 border-l border-slate-200 bg-white p-4 flex flex-col gap-3 shrink-0">
        <p className="text-xs text-slate-400 text-center mt-8">
          Click a node or edge to edit it
        </p>
        <div className="mt-auto space-y-2 text-xs text-slate-400">
          <p>• Right-click canvas to add nodes</p>
          <p>• Drag between handles to connect</p>
          <p>• Delete / Backspace to remove selected</p>
        </div>
      </div>
    );
  }

  // Edge panel
  if (selectedEdge) {
    return (
      <div className="w-64 border-l border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-sm font-medium text-slate-700">Edge</span>
          <button onClick={() => selectEdge(null)} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <Label className="text-xs text-slate-500">Type</Label>
            <p className="text-sm font-mono text-slate-700 mt-1">{selectedEdge.data?.edgeType}</p>
          </div>
          <div>
            <Label className="text-xs text-slate-500">Source → Target</Label>
            <p className="text-xs text-slate-600 mt-1 font-mono">
              {selectedEdge.source} → {selectedEdge.target}
            </p>
          </div>
          <Separator />
          <Button
            variant="destructive"
            size="sm"
            className="w-full text-xs"
            onClick={() => deleteEdge(selectedEdge.id)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete edge
          </Button>
        </div>
      </div>
    );
  }

  // Node panel
  const nodeData = selectedNode!.data as GraphNodeData;

  function handleLabelBlur() {
    if (label.trim() && label !== nodeData.label) {
      renameNode(selectedNode!.id, label.trim());
    }
  }

  function handleDescriptionBlur() {
    if (description !== nodeData.description) {
      updateNodeData(selectedNode!.id, { description });
    }
  }

  function handleAddTag() {
    const tag = tagInput.trim();
    if (!tag) return;
    const tags = [...(nodeData.tags ?? []), tag];
    updateNodeData(selectedNode!.id, { tags });
    setTagInput('');
  }

  function handleRemoveTag(tag: string) {
    const tags = (nodeData.tags ?? []).filter((t) => t !== tag);
    updateNodeData(selectedNode!.id, { tags });
  }

  const vsCodeUrl = nodeData.file && directoryPath
    ? `vscode://file/${directoryPath}/${nodeData.file}${nodeData.lineStart ? `:${nodeData.lineStart}` : ''}`
    : null;

  return (
    <div className="w-64 border-l border-slate-200 bg-white shrink-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${NODE_TYPE_COLORS[nodeData.nodeType as NodeType] ?? 'bg-slate-100 text-slate-600'}`}
          >
            {nodeData.nodeType}
          </span>
          {nodeData.isModified && (
            <span className="text-[10px] bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">
              modified
            </span>
          )}
        </div>
        <button onClick={() => selectNode(null)} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Label */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={handleLabelBlur}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="h-8 text-sm"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              rows={3}
              className="w-full text-xs text-slate-700 border border-slate-200 rounded-md px-2.5 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="What does this do?"
            />
          </div>

          {/* File path */}
          {nodeData.file && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">File</Label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono text-slate-600 truncate flex-1">
                  {nodeData.file}
                </span>
                {vsCodeUrl && (
                  <a
                    href={vsCodeUrl}
                    title="Open in VS Code"
                    className="text-slate-400 hover:text-blue-500 shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500 flex items-center gap-1">
              <Tag className="h-3 w-3" /> Tags
            </Label>
            {nodeData.tags && nodeData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {nodeData.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 cursor-pointer hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                    onClick={() => handleRemoveTag(tag)}
                  >
                    {tag} ×
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="Add tag..."
                className="h-7 text-xs"
              />
              <Button size="sm" variant="outline" onClick={handleAddTag} className="h-7 px-2 text-xs">
                +
              </Button>
            </div>
          </div>

          {/* Props/Methods (read-only display) */}
          {nodeData.props && nodeData.props.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Props</Label>
              <div className="space-y-0.5">
                {nodeData.props.map((prop) => (
                  <p key={prop} className="text-xs font-mono text-slate-600">
                    {prop}
                  </p>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Delete */}
          {!confirmDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete node
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-red-600 font-medium">Delete &quot;{nodeData.label}&quot;?</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => {
                    deleteNode(selectedNode!.id);
                    setConfirmDelete(false);
                  }}
                >
                  Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
