import { requestJson } from './client';

export type AccountUser = {
  id: string;
  email: string;
};

export type AccountSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number | null;
  tokenType: string;
  user: AccountUser;
};

export type RegisterAccountResponse = {
  status: 'SIGNED_IN' | 'CONFIRM_EMAIL';
  session: AccountSession | null;
  email: string;
};

export type CourseProgressResponse = {
  snapshot: Record<string, string>;
  updatedAt: string | null;
};

export function registerAccount(email: string, password: string): Promise<RegisterAccountResponse> {
  return requestJson('/api/account/register', {
    method: 'POST',
    body: { email, password },
  });
}

export function loginAccount(email: string, password: string): Promise<AccountSession> {
  return requestJson('/api/account/login', {
    method: 'POST',
    body: { email, password },
  });
}

export function refreshAccountSession(refreshToken: string): Promise<AccountSession> {
  return requestJson('/api/account/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}

export function fetchAccount(token: string): Promise<AccountUser> {
  return requestJson('/api/account/me', { token });
}

export function fetchCourseProgress(token: string): Promise<CourseProgressResponse> {
  return requestJson('/api/account/progress', { token });
}

export function saveCourseProgress(
  token: string,
  snapshot: Record<string, string>,
): Promise<CourseProgressResponse> {
  return requestJson('/api/account/progress', {
    method: 'PUT',
    token,
    body: { snapshot },
  });
}
