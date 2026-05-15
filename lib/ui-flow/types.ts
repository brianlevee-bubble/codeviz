export type UIFramework = 'next-app' | 'next-pages' | 'react-router' | 'express' | 'unknown';

export interface UIRoute {
  id: string;
  path: string;             // e.g. /dashboard, /settings/:id
  file: string;             // relative source file
  label: string;            // human-readable page name
  isDialog?: boolean;       // modal/dialog, not a full page
  screenshotUrl?: string;   // /ui-captures/{hash}/{routeId}.jpg
  exampleUrl?: string;      // real example URL for dynamic routes
}

export function isDynamicRoute(path: string): boolean {
  return /\/:/.test(path);
}

export interface UINavEdge {
  id: string;
  source: string;           // route id
  target: string;           // route id
  label?: string;           // e.g. "Sign in", "Back", "Submit"
  navType: 'link' | 'push' | 'redirect' | 'button' | 'form';
}

export interface UIFlowGraph {
  projectPath: string;
  framework: UIFramework;
  port: number | null;
  routes: UIRoute[];
  edges: UINavEdge[];
  capturedAt?: string;
}
