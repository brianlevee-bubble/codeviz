export type PaymentProvider =
  | 'stripe'
  | 'paypal'
  | 'square'
  | 'braintree'
  | 'adyen'
  | 'razorpay'
  | 'mollie'
  | 'paddle'
  | 'lemonsqueezy'
  | 'other';

export type PaymentFlowType =
  | 'checkout'
  | 'subscription'
  | 'one-time'
  | 'invoice'
  | 'marketplace'
  | 'refund'
  | 'payout';

export interface PaymentWebhook {
  event: string;
  path: string;
  file: string;
  description: string;
}

export interface PaymentProduct {
  id: string;
  name: string;
  type: 'one-time' | 'recurring';
  priceDescription: string;
  file: string;
}

export interface PaymentFlow {
  id: string;
  name: string;
  type: PaymentFlowType;
  description: string;
  steps: string[];
  files: string[];
  provider: PaymentProvider;
}

export interface PaymentProviderConfig {
  id: string;
  provider: PaymentProvider;
  name: string;
  description: string;
  package?: string;
  version?: string;
  docsUrl?: string;
  status: 'active' | 'inactive' | 'misconfigured';
  envKeys: Array<{
    key: string;
    description: string;
    isSecret: boolean;
    isSet: boolean;
  }>;
  webhooks: PaymentWebhook[];
  products: PaymentProduct[];
  flows: PaymentFlow[];
  files: string[];
  currencies: string[];
  testMode: boolean;
}

export interface PaymentsGraph {
  providers: PaymentProviderConfig[];
  flows: PaymentFlow[];
  summary: {
    totalProviders: number;
    totalFlows: number;
    totalWebhooks: number;
    totalProducts: number;
    missingEnvVars: string[];
    hasTestMode: boolean;
  };
}
