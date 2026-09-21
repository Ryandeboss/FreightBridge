export interface HealthResponse {
  status: 'ok';
  service: 'freightbridge-api';
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  service: 'freightbridge-api';
  environment?: string;
  dependencies: {
    configuration?: 'ok' | 'error';
    database?: 'ok' | 'error';
    domain_schema?: 'ok' | 'error';
  };
}

interface ReadinessErrorResponse {
  detail?: ReadinessResponse;
}

export interface SystemStatus {
  api: 'online' | 'unreachable';
  database: 'connected' | 'unavailable';
  domainSchema: 'ready' | 'unavailable';
  environment: string;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = (await response.json()) as T;

  if (!response.ok) {
    throw Object.assign(new Error('Request failed'), {
      response,
      payload,
    });
  }

  return payload;
}

function buildUrl(apiBaseUrl: string, path: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}${path}`;
}

export async function fetchSystemStatus(apiBaseUrl: string): Promise<SystemStatus> {
  const health = await requestJson<HealthResponse>(buildUrl(apiBaseUrl, '/health'));
  const apiOnline = health.status === 'ok' && health.service === 'freightbridge-api';

  try {
    const readiness = await requestJson<ReadinessResponse>(
      buildUrl(apiBaseUrl, '/readiness'),
    );

    return {
      api: apiOnline ? 'online' : 'unreachable',
      database: readiness.dependencies.database === 'ok' ? 'connected' : 'unavailable',
      domainSchema: readiness.dependencies.domain_schema === 'ok' ? 'ready' : 'unavailable',
      environment: readiness.environment || 'unknown',
    };
  } catch (error) {
    const payload = (error as { payload?: ReadinessErrorResponse }).payload;
    const readiness = payload?.detail;

    return {
      api: apiOnline ? 'online' : 'unreachable',
      database: readiness?.dependencies.database === 'ok' ? 'connected' : 'unavailable',
      domainSchema: readiness?.dependencies.domain_schema === 'ok' ? 'ready' : 'unavailable',
      environment: readiness?.environment || 'unknown',
    };
  }
}
