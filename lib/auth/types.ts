export type AuthProvider =
  | 'nextauth'
  | 'clerk'
  | 'supabase'
  | 'firebase'
  | 'lucia'
  | 'authjs'
  | 'custom'
  | 'none';

export type AuthFeature =
  | 'email_password'
  | 'magic_link'
  | 'oauth_google'
  | 'oauth_github'
  | 'oauth_microsoft'
  | 'oauth_apple'
  | 'oauth_other'
  | 'two_factor'
  | 'session_jwt'
  | 'session_database'
  | 'role_based'
  | 'api_key'
  | 'webhook';

export interface AuthProviderConfig {
  provider: AuthProvider;
  label: string;
  description: string;
  configFile?: string;
  envVars: string[];
  features: AuthFeature[];
  setupSteps: string[];
}

export interface DetectedAuth {
  provider: AuthProvider;
  label: string;
  configFile?: string;
  features: AuthFeature[];
  envVars: { name: string; set: boolean }[];
  routes: AuthRoute[];
  issues: AuthIssue[];
}

export interface AuthRoute {
  path: string;
  file: string;
  type: 'login' | 'register' | 'callback' | 'logout' | 'verify' | 'reset' | 'api' | 'middleware';
  description: string;
}

export interface AuthIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  fix?: string;
}

export interface AuthRecommendation {
  id: string;
  feature: AuthFeature;
  label: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  priority: 'recommended' | 'optional' | 'advanced';
}

export interface AuthAnalysis {
  detected: DetectedAuth | null;
  recommendations: AuthRecommendation[];
  availableProviders: AuthProviderConfig[];
}
