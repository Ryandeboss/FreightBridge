export const HEALTHY_WALKTHROUGH_STORAGE_KEY = 'freightbridge.healthyWalkthrough';

export type HealthyWalkthroughState = {
  runId: string;
  loadId: string;
  part1Complete: boolean;
  completedAt: string;
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
    };
  } catch {
    return null;
  }
}

export function isHealthyApexTenderComplete(): boolean {
  return loadHealthyWalkthroughState()?.part1Complete === true;
}

export function saveHealthyApexTenderProgress(runId: string, loadId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    HEALTHY_WALKTHROUGH_STORAGE_KEY,
    JSON.stringify({ runId, loadId, part1Complete: true, completedAt: new Date().toISOString() }),
  );
}
