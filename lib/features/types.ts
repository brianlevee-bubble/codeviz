export type FeatureCategory =
  | 'authentication'
  | 'notifications'
  | 'search'
  | 'payments'
  | 'analytics'
  | 'collaboration'
  | 'content'
  | 'productivity'
  | 'onboarding'
  | 'settings'
  | 'integrations'
  | 'other';

export type FeatureStatus = 'existing' | 'suggested';
export type FeatureImpact = 'high' | 'medium' | 'low';
export type FeatureEffort = 'small' | 'medium' | 'large';

export interface AppFeature {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: FeatureStatus;
  category: FeatureCategory;
  impact: FeatureImpact;
  effort: FeatureEffort;
  whyItMatters: string;
  gaps?: string;
}

export interface FeaturesAnalysis {
  projectName: string;
  features: AppFeature[];
}

export interface SuggestedTest {
  title: string;
  description: string;
  type: 'unit' | 'integration' | 'e2e';
}

export interface FeatureImprovement {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface FeatureDetails {
  featureId: string;
  howItWorks?: string;
  suggestedTests: SuggestedTest[];
  improvements: FeatureImprovement[];
}
