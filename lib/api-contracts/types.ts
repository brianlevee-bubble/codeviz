export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type AuthType = 'none' | 'session' | 'jwt' | 'api_key' | 'oauth' | 'basic' | 'unknown';

export interface ApiParam {
  name: string;
  location: 'path' | 'query' | 'body' | 'header';
  type: string;
  required: boolean;
  description?: string;
}

export interface ApiEndpoint {
  id: string;
  method: HttpMethod;
  path: string;           // e.g. "/api/users/[id]"
  file: string;           // relative file path
  category: string;       // first path segment after /api/
  summary: string;
  auth: AuthType;
  requiredRoles?: string[];
  requestBody?: {
    contentType: string;
    schema: string;
  };
  responseBody?: {
    statusCode: number;
    schema: string;
  };
  params: ApiParam[];
  codeSnippet?: string;
}

export interface ApiContractsReport {
  endpoints: ApiEndpoint[];
  categories: string[];
  stats: {
    totalEndpoints: number;
    byMethod: Record<string, number>;
    publicCount: number;
    protectedCount: number;
  };
}
