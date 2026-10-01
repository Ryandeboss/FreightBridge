import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  fetchCourseProgress,
  loginAccount,
  refreshAccountSession,
  registerAccount,
  saveCourseProgress,
  type AccountSession,
} from '../api/account';
import { ApiError } from '../api/client';
import { fetchSummary } from '../api/operations';
import {
  applyTrainingSnapshot,
  captureTrainingSnapshot,
  clearTrainingSnapshot,
  TRAINING_STATE_UPDATED_EVENT,
} from '../training/sync';
import { ACCOUNT_SESSION_STORAGE_KEY, OPERATIONS_TOKEN_STORAGE_KEY } from './storage';

type RegistrationResult = 'SIGNED_IN' | 'CONFIRM_EMAIL';

type OperationsSessionContextValue = {
  token: string | null;
  isAuthenticated: boolean;
  isAccountSession: boolean;
  accountEmail: string | null;
  sessionMessage: string | null;
  connect: (token: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<RegistrationResult>;
  lock: (message?: string | null) => void;
  handleApiError: (error: unknown) => void;
};

const OperationsSessionContext = createContext<OperationsSessionContextValue | null>(null);

function readStoredAccountSession(): AccountSession | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNT_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AccountSession>;
    if (
      typeof parsed.accessToken !== 'string'
      || typeof parsed.refreshToken !== 'string'
      || typeof parsed.expiresIn !== 'number'
      || !parsed.user
      || typeof parsed.user.email !== 'string'
    ) return null;
    return parsed as AccountSession;
  } catch {
    return null;
  }
}

function readLegacyOperationsToken(): string | null {
  try {
    return window.sessionStorage.getItem(OPERATIONS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeAccountSession(session: AccountSession): void {
  window.localStorage.setItem(ACCOUNT_SESSION_STORAGE_KEY, JSON.stringify(session));
  window.sessionStorage.removeItem(OPERATIONS_TOKEN_STORAGE_KEY);
}

async function hydrateCourseProgress(accessToken: string): Promise<void> {
  const localSnapshot = captureTrainingSnapshot();
  const remote = await fetchCourseProgress(accessToken);

  if (remote.updatedAt === null) {
    if (Object.keys(localSnapshot).length > 0) {
      await saveCourseProgress(accessToken, localSnapshot);
    }
    return;
  }

  applyTrainingSnapshot(remote.snapshot);
}

export function OperationsSessionProvider({ children }: { children: ReactNode }) {
  const [accountSession, setAccountSession] = useState<AccountSession | null>(() => readStoredAccountSession());
  const [legacyToken, setLegacyToken] = useState<string | null>(() => readLegacyOperationsToken());
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const token = accountSession?.accessToken ?? legacyToken;
  const isAccountSession = Boolean(accountSession);

  const lock = useCallback((message: string | null = null) => {
    try {
      window.localStorage.removeItem(ACCOUNT_SESSION_STORAGE_KEY);
      window.sessionStorage.removeItem(OPERATIONS_TOKEN_STORAGE_KEY);
      if (accountSession) clearTrainingSnapshot(false);
    } catch {
      // Storage can be unavailable in private browser contexts.
    }
    setAccountSession(null);
    setLegacyToken(null);
    setSessionMessage(message);
  }, [accountSession]);

  const connect = useCallback(async (candidate: string) => {
    const trimmed = candidate.trim();
    if (!trimmed) {
      throw new ApiError('Enter an operations token.', 401, 'AUTHENTICATION_ERROR');
    }

    await fetchSummary(trimmed, 24);

    try {
      window.sessionStorage.setItem(OPERATIONS_TOKEN_STORAGE_KEY, trimmed);
    } catch {
      throw new ApiError('The browser could not start a secure console session.', 0, 'STORAGE_ERROR');
    }

    setLegacyToken(trimmed);
    setSessionMessage(null);
  }, []);

  const activateAccountSession = useCallback(async (session: AccountSession) => {
    try {
      storeAccountSession(session);
    } catch {
      throw new ApiError('The browser could not save your account session.', 0, 'STORAGE_ERROR');
    }

    setAccountSession(session);
    setLegacyToken(null);
    setSessionMessage(null);

    try {
      await hydrateCourseProgress(session.accessToken);
    } catch {
      setSessionMessage('Signed in. Course progress sync is temporarily unavailable, so this browser will keep your progress locally.');
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const session = await loginAccount(email.trim(), password);
    await activateAccountSession(session);
  }, [activateAccountSession]);

  const register = useCallback(async (email: string, password: string): Promise<RegistrationResult> => {
    const result = await registerAccount(email.trim(), password);
    if (result.status === 'SIGNED_IN' && result.session) {
      await activateAccountSession(result.session);
    }
    return result.status;
  }, [activateAccountSession]);

  useEffect(() => {
    if (!accountSession?.refreshToken) return undefined;

    const expiresAtMs = accountSession.expiresAt
      ? accountSession.expiresAt * 1000
      : Date.now() + accountSession.expiresIn * 1000;
    const delay = Math.max(1_000, expiresAtMs - Date.now() - 60_000);

    const timer = window.setTimeout(() => {
      void refreshAccountSession(accountSession.refreshToken)
        .then((next) => {
          storeAccountSession(next);
          setAccountSession(next);
          setSessionMessage(null);
        })
        .catch(() => {
          lock('Your account session expired. Sign in again to continue.');
        });
    }, delay);

    return () => window.clearTimeout(timer);
  }, [accountSession, lock]);

  useEffect(() => {
    if (!accountSession) return undefined;

    let timer: number | undefined;
    const syncProgress = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void saveCourseProgress(accountSession.accessToken, captureTrainingSnapshot()).catch(() => {
          setSessionMessage('Your latest progress is saved in this browser, but the server copy could not be updated yet.');
        });
      }, 250);
    };

    window.addEventListener(TRAINING_STATE_UPDATED_EVENT, syncProgress);
    return () => {
      window.removeEventListener(TRAINING_STATE_UPDATED_EVENT, syncProgress);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [accountSession]);

  const handleApiError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        lock('Your session expired or the token was rejected. Sign in again to continue.');
      }
    },
    [lock],
  );

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      isAccountSession,
      accountEmail: accountSession?.user.email ?? null,
      sessionMessage,
      connect,
      signIn,
      register,
      lock,
      handleApiError,
    }),
    [
      accountSession,
      connect,
      handleApiError,
      isAccountSession,
      lock,
      register,
      sessionMessage,
      signIn,
      token,
    ],
  );

  return (
    <OperationsSessionContext.Provider value={value}>
      {children}
    </OperationsSessionContext.Provider>
  );
}

export function useOperationsSession() {
  const context = useContext(OperationsSessionContext);
  if (!context) {
    throw new Error('useOperationsSession must be used inside OperationsSessionProvider');
  }
  return context;
}
