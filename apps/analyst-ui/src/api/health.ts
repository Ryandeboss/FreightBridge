import { requestJson } from './client';

export type SystemStatus = {
  api: 'online' | 'unreachable';
  database: 'connected' | 'unavailable';
  domainSchema: 'ready' | 'unavailable';
  environment: string;
};

type ReadinessResponse = {
  status: string;
  environment?: string;
  dependencies?: {
    database?: string;
    domain_schema?: string;
  };
};

export async function fetchSystemStatus(): Promise<SystemStatus> {
  try {
    const readiness = await requestJson<ReadinessResponse>('/readiness');
    return {
      api: readiness.status === 'ready' ? 'online' : 'unreachable',
      database: readiness.dependencies?.database === 'ok' ? 'connected' : 'unavailable',
      domainSchema: readiness.dependencies?.domain_schema === 'ok' ? 'ready' : 'unavailable',
      environment: readiness.environment ?? import.meta.env.VITE_APP_ENV ?? 'unknown',
    };
  } catch {
    return {
      api: 'unreachable',
      database: 'unavailable',
      domainSchema: 'unavailable',
      environment: import.meta.env.VITE_APP_ENV ?? 'unknown',
    };
  }
}
