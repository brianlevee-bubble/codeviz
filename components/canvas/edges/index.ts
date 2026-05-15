import { RendersEdge } from './RendersEdge';
import { CallsEdge } from './CallsEdge';
import { DataFlowEdge } from './DataFlowEdge';
import { ReadWriteEdge } from './ReadWriteEdge';

export const edgeTypes = {
  renders: RendersEdge,
  calls: CallsEdge,
  dataFlow: DataFlowEdge,
  reads: ReadWriteEdge,
  writes: ReadWriteEdge,
};
