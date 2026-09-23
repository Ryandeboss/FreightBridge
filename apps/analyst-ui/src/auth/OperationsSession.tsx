import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { ApiError } from '../api/client';
import { fetchSummary } from '../api/operations';
import { OPERATIONS_TOKEN_STORAGE_KEY } from './storage';

type OperationsSessionContextValue = {
  token: string | null;
  isAuthenticated: boolean;
  sessionMessage: string | null;
  connect: (token: string) => Promise<void>;
  lock: (message?: string | null) => void;
  handleApiError: (error: unknown) => void;
};

const OperationsSessionContext = createContext<OperationsSessionContextValue | null>(null);

export function OperationsSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(OPERATIONS_TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  const lock = useCallback((message: string | null = null) => {
    try {
      window.sessionStorage.removeItem(OPERATIONS_TOKEN_STORAGE_KEY);
    } catch {
      // Storage can be unavailable in private browser contexts.
    }
    setToken(null);
    setSessionMessage(message);
  }, []);

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

    setToken(trimmed);
    setSessionMessage(null);
  }, []);

  const handleApiError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        lock('Your console session expired or the token was rejected.');
      }
    },
    [lock],
  );

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      sessionMessage,
      connect,
      lock,
      handleApiError,
    }),
    [connect, handleApiError, lock, sessionMessage, token],
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
