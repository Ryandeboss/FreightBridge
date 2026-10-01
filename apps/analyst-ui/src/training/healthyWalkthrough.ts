import { notifyTrainingStateChanged } from './sync';

export const HEALTHY_WALKTHROUGH_STORAGE_KEY = 'freightbridge.healthyWalkthrough';

export type HealthyWalkthroughState = {
  runId: string;
  loadId: string;
  part1Complete: boolean;
  completedAt: string;
  part2Complete?: boolean;
  part2CompletedAt?: string;
  part3Complete?: boolean;
  part3CompletedAt?: string;
  part4Complete?: boolean;
  part4CompletedAt?: string;
};

export function loadHealthyWalkthroughState(): HealthyWalkthroughState | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(HEALTHY_WALKTHROUGH_STORAGE_KEY);
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<HealthyWalkthroughState>;
    if (
      typeof value.runId !== 'string'
      || typeof value.loadId !== 'string'
      || value.part1Complete !== true
      || typeof value.completedAt !== 'string'
    ) return null;
    return {
      runId: value.runId,
      loadId: value.loadId,
      part1Complete: true,
      completedAt: value.completedAt,
      part2Complete: value.part2Complete === true,
      part2CompletedAt: typeof value.part2CompletedAt === 'string' ? value.part2CompletedAt : undefined,
      part3Complete: value.part3Complete === true,
      part3CompletedAt: typeof value.part3CompletedAt === 'string' ? value.part3CompletedAt : undefined,
      part4Complete: value.part4Complete === true,
      part4CompletedAt: typeof value.part4CompletedAt === 'string' ? value.part4CompletedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function isHealthyApexTenderComplete(): boolean {
  return loadHealthyWalkthroughState()?.part1Complete === true;
}

export function isHealthyMapping204Complete(): boolean {
  return loadHealthyWalkthroughState()?.part2Complete === true;
}

export function isHealthy997990Complete(): boolean {
  return loadHealthyWalkthroughState()?.part3Complete === true;
}

export function isHealthyShipmentStatusComplete(): boolean {
  return loadHealthyWalkthroughState()?.part4Complete === true;
}

export function healthyWalkthroughNextPath(): string {
  return '/learn/healthy/workstation';
}

export function saveHealthyApexTenderProgress(runId: string, loadId: string): void {
  if (typeof window === 'undefined') return;
  const existing = loadHealthyWalkthroughState();
  window.localStorage.setItem(
    HEALTHY_WALKTHROUGH_STORAGE_KEY,
    JSON.stringify({
      ...existing,
      runId,
      loadId,
      part1Complete: true,
      completedAt: existing?.completedAt ?? new Date().toISOString(),
    }),
  );
  notifyTrainingStateChanged();
}

export function saveHealthyMapping204Progress(runId: string, loadId: string): void {
  if (typeof window === 'undefined') return;
  const existing = loadHealthyWalkthroughState();
  window.localStorage.setItem(
    HEALTHY_WALKTHROUGH_STORAGE_KEY,
    JSON.stringify({
      ...existing,
      runId,
      loadId,
      part1Complete: true,
      completedAt: existing?.completedAt ?? new Date().toISOString(),
      part2Complete: true,
      part2CompletedAt: existing?.part2CompletedAt ?? new Date().toISOString(),
    }),
  );
  notifyTrainingStateChanged();
}

export function saveHealthy997990Progress(runId: string, loadId: string): void {
  if (typeof window === 'undefined') return;
  const existing = loadHealthyWalkthroughState();
  window.localStorage.setItem(
    HEALTHY_WALKTHROUGH_STORAGE_KEY,
    JSON.stringify({
      ...existing,
      runId,
      loadId,
      part1Complete: true,
      completedAt: existing?.completedAt ?? new Date().toISOString(),
      part2Complete: true,
      part2CompletedAt: existing?.part2CompletedAt ?? new Date().toISOString(),
      part3Complete: true,
      part3CompletedAt: new Date().toISOString(),
    }),
  );
  notifyTrainingStateChanged();
}

export function saveHealthyShipmentStatusProgress(runId: string, loadId: string): void {
  if (typeof window === 'undefined') return;
  const existing = loadHealthyWalkthroughState();
  window.localStorage.setItem(
    HEALTHY_WALKTHROUGH_STORAGE_KEY,
    JSON.stringify({
      ...existing,
      runId,
      loadId,
      part1Complete: true,
      completedAt: existing?.completedAt ?? new Date().toISOString(),
      part2Complete: true,
      part2CompletedAt: existing?.part2CompletedAt ?? new Date().toISOString(),
      part3Complete: true,
      part3CompletedAt: existing?.part3CompletedAt ?? new Date().toISOString(),
      part4Complete: true,
      part4CompletedAt: new Date().toISOString(),
    }),
  );
  notifyTrainingStateChanged();
}
