import { ComponentNode } from './ComponentNode';
import { PageRouteNode } from './PageRouteNode';
import { APIEndpointNode } from './APIEndpointNode';
import { DatabaseNode } from './DatabaseNode';
import { ExternalServiceNode } from './ExternalServiceNode';
import { StateNode } from './StateNode';
import { UtilityNode } from './UtilityNode';

export const nodeTypes = {
  Component: ComponentNode,
  PageRoute: PageRouteNode,
  APIEndpoint: APIEndpointNode,
  Database: DatabaseNode,
  ExternalService: ExternalServiceNode,
  State: StateNode,
  Utility: UtilityNode,
};
