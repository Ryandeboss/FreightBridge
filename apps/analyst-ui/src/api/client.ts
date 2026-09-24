export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || 'http://localhost:8000';

export type QueryValue = string | number | boolean | null | undefined;

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH';
  token?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
};

export function buildPath(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    params.set(key, String(value));
  });

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export async function requestJson<T>(
  path: string,
  { method = 'GET', token, query, body }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${buildPath(path, query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Unable to reach the FreightBridge API.', 0, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new ApiError(detail.message, response.status, detail.code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function readErrorDetail(response: Response): Promise<{ code: string; message: string }> {
  try {
    const payload = (await response.json()) as {
      detail?: { error?: { code?: string; message?: string } } | string;
      error?: { code?: string; message?: string };
      message?: string;
    };

    if (typeof payload.detail === 'string') {
      return { code: 'UNKNOWN_ERROR', message: payload.detail };
    }

    const error = payload.detail?.error ?? payload.error;
    return {
      code: error?.code ?? 'UNKNOWN_ERROR',
      message: error?.message ?? payload.message ?? 'FreightBridge API request failed.',
    };
  } catch {
    return {
      code: response.status === 401 ? 'AUTHENTICATION_ERROR' : 'UNKNOWN_ERROR',
      message: 'FreightBridge API request failed.',
    };
  }
}
