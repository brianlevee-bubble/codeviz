export type StepKind = 'trigger' | 'process' | 'data' | 'integration' | 'decision' | 'output' | 'error-handler';

export interface BackendStep {
  id: string;
  label: string;
  description?: string;
  kind: StepKind;
  file?: string;
  method?: string;
}

export interface BackendConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export interface BackendWorkflow {
  id: string;
  name: string;
  description?: string;
  triggerType: 'api-route' | 'server-action' | 'cron' | 'webhook' | 'queue' | 'event';
  entryFile: string;
  steps: BackendStep[];
  connections: BackendConnection[];
}

export interface BackendWorkflowsAnalysis {
  workflows: BackendWorkflow[];
}
