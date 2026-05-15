export type StateKind = 'initial' | 'active' | 'review' | 'terminal' | 'error' | 'gateway';

export interface WorkflowState {
  id: string;            // snake_case, unique within workflow
  label: string;         // display name, e.g. "IN_REVIEW"
  description?: string;  // e.g. "Waiting for admin approval"
  kind: StateKind;
}

export interface WorkflowTransition {
  id: string;
  from: string;           // state id
  to: string;             // state id
  action: string;         // e.g. "Submit", "Approve", "Request Changes"
  actors?: string[];      // e.g. ["EDIT"] or ["ADMIN", "OWNER"]
  guards?: string[];      // e.g. ["reviewRequired = true"]
  sideEffects?: string[]; // e.g. ["email to assignee", "Slack notification"]
  isRegression?: boolean; // backward edge — rendered dashed
}

export interface Workflow {
  id: string;
  entity: string;        // e.g. "Task"
  enumName?: string;     // e.g. "TaskStatus"
  file: string;
  description?: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

export interface WorkflowsAnalysis {
  workflows: Workflow[];
}
