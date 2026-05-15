export type ResourceType = 'page' | 'api' | 'server_action' | 'middleware';
export type RuleType =
  | 'requires_auth'      // must be logged in
  | 'requires_role'      // must have specific role/permission
  | 'ownership'          // can only access own data
  | 'field_filter'       // fields stripped before returning
  | 'rate_limit'         // request rate limiting
  | 'input_validation'   // input sanitized/validated
  | 'middleware'         // middleware applied
  | 'audit_log'          // actions are logged
  | 'encryption'         // data is encrypted at rest/transit
  | 'pii'                // handles PII / personal data;

export interface SecurityRule {
  id: string;
  type: RuleType;
  /** Short label shown on the node, e.g. "Admin only" */
  label: string;
  /** Full description of the rule */
  description: string;
  /** Snippet of the actual code implementing this rule */
  code?: string;
  /** Roles this rule applies to, if type === 'requires_role' */
  roles?: string[];
  /** Fields hidden/stripped, if type === 'field_filter' */
  hiddenFields?: string[];
}

export interface SecuredResource {
  id: string;
  label: string;
  route?: string;
  file: string;
  resourceType: ResourceType;
  /** Top-level summary: e.g. "Requires login, team-admin only" */
  summary: string;
  requiresAuth: boolean;
  /** All roles that can access this resource */
  allowedRoles: string[];
  rules: SecurityRule[];
}

export interface GlobalPolicy {
  /** e.g. "All routes protected by middleware" */
  description: string;
  file: string;
  code?: string;
}

export interface RoleGroup {
  /** Machine key, e.g. "global", "project", "organization" */
  scope: string;
  /** Human label shown in the UI, e.g. "App-wide", "Per project" */
  scopeLabel: string;
  /** Optional sentence describing what this scope governs */
  description?: string;
  /** Role names that belong to this scope */
  roles: string[];
}

export interface SecurityGraph {
  globalPolicies: GlobalPolicy[];
  resources: SecuredResource[];
  /** All distinct roles found across the app (flat, for backward compat) */
  allRoles: string[];
  /** Roles grouped by scope — present when multiple scopes are detected */
  roleGroups?: RoleGroup[];
}
