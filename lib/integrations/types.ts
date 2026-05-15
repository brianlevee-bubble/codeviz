export type IntegrationCategory =
  | 'payment'
  | 'auth'
  | 'email'
  | 'storage'
  | 'analytics'
  | 'messaging'
  | 'database'
  | 'api'
  | 'monitoring'
  | 'cdn'
  | 'search'
  | 'ai'
  | 'other';

export interface IntegrationEndpoint {
  method: string;
  path: string;
  file: string;
  description: string;
}

export interface IntegrationConfig {
  key: string;
  value: string;
  file: string;
  line?: number;
  isSecret: boolean;
}

export interface Integration {
  id: string;
  name: string;
  category: IntegrationCategory;
  description: string;
  package?: string;
  version?: string;
  docsUrl?: string;
  endpoints: IntegrationEndpoint[];
  configKeys: IntegrationConfig[];
  files: string[];
  status: 'active' | 'unused' | 'misconfigured';
}

export interface IntegrationsGraph {
  integrations: Integration[];
  summary: {
    total: number;
    byCategory: Record<string, number>;
    missingEnvVars: string[];
  };
}
