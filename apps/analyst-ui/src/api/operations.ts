import { requestJson, type QueryValue } from './client';

export type TransactionSummary = {
  id: string;
  correlationId: string;
  partnerCode: string;
  partnerName: string;
  direction: string;
  transport: string;
  messageFormat: string;
  documentType: string;
  businessIdentifier: string | null;
  x12Version: string | null;
  interchangeControlNumber: string | null;
  groupControlNumber: string | null;
  transactionControlNumber: string | null;
  processingStatus: string;
  processingStage: string;
  retryCount: number;
  parentTransactionId: string | null;
  replayOfTransactionId: string | null;
  mappingProfileId: string | null;
  mappingProfileVersion: number | null;
  mappingKey: string | null;
  receivedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
  errorCount: number;
};

export type ProcessingLog = {
  id: string;
  transactionId: string;
  stage: string;
  status: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type IntegrationError = {
  errorId: string;
  transactionId: string;
  businessIdentifier: string | null;
  partnerCode: string | null;
  documentType: string | null;
  category: string;
  errorCode: string;
  safeMessage: string;
  stage: string;
  retryable: boolean;
  resolved: boolean;
  resolutionNote: string | null;
  resolvedByTransactionId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  correlationId: string | null;
};

export type TransactionDetail = Omit<
  TransactionSummary,
  'partnerCode' | 'partnerName' | 'errorCount'
> & {
  partner: {
    id: string;
    partnerCode: string;
    partnerName: string;
  };
  payloadHash: string | null;
  rawPayloadLocation: string | null;
};

export type RetryAttempt = {
  id: string;
  originalTransactionId: string;
  retryTransactionId: string;
  attemptNumber: number;
  status: string;
  note: string | null;
  deliveryDisposition: string | null;
  errorCode: string | null;
  safeMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type TransactionDetailResponse = {
  transaction: TransactionDetail;
  parent: TransactionSummary | null;
  children: TransactionSummary[];
  retryAttempts: RetryAttempt[];
  logs: ProcessingLog[];
  errors: IntegrationError[];
};

export type TransactionSearchResponse = {
  limit: number;
  offset: number;
  count: number;
  transactions: TransactionSummary[];
};

export type ErrorQueueResponse = {
  limit: number;
  offset: number;
  count: number;
  errors: IntegrationError[];
};

export type ErrorDetailResponse = {
  error: IntegrationError;
  transaction: TransactionSummary;
  logs: ProcessingLog[];
};

export type OperationalSummary = {
  hours: number;
  generatedAt: string;
  transactionsTotal: number;
  transactionsSucceeded: number;
  transactionsFailed: number;
  transactionsProcessing: number;
  unresolvedErrors: number;
  retryableUnresolvedErrors: number;
  byErrorCategory: Record<string, number>;
  byDocumentType: Record<string, number>;
};

export type BusinessTraceResponse = {
  businessIdentifier: string;
  transactionCount: number;
  failedTransactionCount: number;
  unresolvedErrorCount: number;
  transactions: TransactionSummary[];
  links: Array<{
    parentTransactionId: string;
    childTransactionId: string;
  }>;
};

export type RetryTransactionResponse = {
  status: string;
  originalTransactionId: string;
  retryTransactionId: string | null;
  attemptNumber: number | null;
  documentType: string | null;
  businessIdentifier: string | null;
  transport: string | null;
  fileName: string | null;
  remotePath: string | null;
  deliveryDisposition: string | null;
};

export type TransactionFilters = {
  businessIdentifier?: string;
  correlationId?: string;
  partnerCode?: string;
  direction?: string;
  transport?: string;
  messageFormat?: string;
  documentType?: string;
  status?: string;
  stage?: string;
  limit?: number;
  offset?: number;
};

export type ErrorFilters = {
  resolved?: boolean | '';
  retryable?: boolean | '';
  category?: string;
  errorCode?: string;
  stage?: string;
  partnerCode?: string;
  businessIdentifier?: string;
  documentType?: string;
  limit?: number;
  offset?: number;
};

export function fetchSummary(token: string, hours: number): Promise<OperationalSummary> {
  return requestJson('/api/operations/summary', { token, query: { hours } });
}

export function fetchTransactions(
  token: string,
  filters: TransactionFilters = {},
): Promise<TransactionSearchResponse> {
  return requestJson('/api/operations/transactions', {
    token,
    query: filters as Record<string, QueryValue>,
  });
}

export function fetchTransactionDetail(
  token: string,
  transactionId: string,
): Promise<TransactionDetailResponse> {
  return requestJson(`/api/operations/transactions/${transactionId}`, { token });
}

export function retryTransaction(
  token: string,
  transactionId: string,
  note?: string,
): Promise<RetryTransactionResponse> {
  return requestJson(`/api/operations/transactions/${transactionId}/retry`, {
    token,
    method: 'POST',
    body: { note: note?.trim() || null },
  });
}

export function fetchErrors(
  token: string,
  filters: ErrorFilters = {},
): Promise<ErrorQueueResponse> {
  return requestJson('/api/operations/errors', {
    token,
    query: filters as Record<string, QueryValue>,
  });
}

export function fetchErrorDetail(token: string, errorId: string): Promise<ErrorDetailResponse> {
  return requestJson(`/api/operations/errors/${errorId}`, { token });
}

export function resolveError(
  token: string,
  errorId: string,
  note?: string,
): Promise<ErrorDetailResponse> {
  return requestJson(`/api/operations/errors/${errorId}/resolve`, {
    token,
    method: 'POST',
    body: { note: note?.trim() || null },
  });
}

export function reopenError(token: string, errorId: string): Promise<ErrorDetailResponse> {
  return requestJson(`/api/operations/errors/${errorId}/reopen`, {
    token,
    method: 'POST',
  });
}

export function fetchBusinessTrace(
  token: string,
  businessIdentifier: string,
): Promise<BusinessTraceResponse> {
  return requestJson(`/api/operations/business/${encodeURIComponent(businessIdentifier)}/trace`, {
    token,
  });
}
