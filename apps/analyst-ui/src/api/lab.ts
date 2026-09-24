import { requestJson, type QueryValue } from './client';

export type LabStep = {
  id: string;
  runId: string;
  stepKey: string;
  sequence: number;
  displayName: string;
  sender: string;
  receiver: string;
  transport: string;
  messageFormat: string;
  documentType: string;
  status: string;
  attemptCount: number;
  requestSummary: Record<string, unknown>;
  responseSummary: Record<string, unknown>;
  relatedTransactionIds: string[];
  errorCode: string | null;
  safeMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type LabRun = {
  id: string;
  scenarioKey: string;
  businessIdentifier: string;
  status: string;
  inputSnapshot: Record<string, unknown>;
  resultSummary: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  steps: LabStep[];
};

export type LabScenario = {
  scenarioKey: string;
  name: string;
  description: string;
  stepCount: number;
};

export type LabReadiness = {
  status: string;
  scenarios: LabScenario[];
  dependencies: Record<string, unknown>;
};

export type LabRunList = {
  limit: number;
  offset: number;
  count: number;
  runs: LabRun[];
};

export type LabExecutionResponse = {
  run: LabRun;
  step: LabStep | null;
  alreadyCompleted: boolean;
};

export function fetchLabReadiness(token: string): Promise<LabReadiness> {
  return requestJson('/api/lab/readiness', { token });
}

export function fetchLabRuns(token: string, filters: Record<string, QueryValue> = {}): Promise<LabRunList> {
  return requestJson('/api/lab/runs', { token, query: filters });
}

export function fetchLabRun(token: string, runId: string): Promise<LabRun> {
  return requestJson(`/api/lab/runs/${encodeURIComponent(runId)}`, { token });
}

export function createLabRun(
  token: string,
  body: { scenarioKey: string; loadId?: string; equipmentType?: string; weightLbs?: number; pieces?: number },
): Promise<LabRun> {
  return requestJson('/api/lab/runs', { token, method: 'POST', body });
}

export function executeLabStep(token: string, runId: string, stepKey: string): Promise<LabExecutionResponse> {
  return requestJson(`/api/lab/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepKey)}/execute`, {
    token,
    method: 'POST',
  });
}

export function runNextLabStep(token: string, runId: string): Promise<LabExecutionResponse> {
  return requestJson(`/api/lab/runs/${encodeURIComponent(runId)}/run-next`, { token, method: 'POST' });
}
