export const TRAINING_STATE_UPDATED_EVENT = 'freightbridge:training-state-updated';

export const COURSE_PROGRESS_STORAGE_KEYS = [
  'freightbridge.learningJourneyStarted',
  'freightbridge.firstDayOrientationComplete',
  'freightbridge.ediProtocolBootcamp',
  'freightbridge.healthyLesson',
  'freightbridge.healthyWalkthrough',
  'freightbridge.trainingProgress',
  'freightbridge.replaySequencePracticeComplete',
  'freightbridge.independentInvestigationComplete',
] as const;

export function captureTrainingSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (typeof window === 'undefined') return snapshot;

  for (const key of COURSE_PROGRESS_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }
  return snapshot;
}

export function applyTrainingSnapshot(snapshot: Record<string, string>): void {
  if (typeof window === 'undefined') return;

  for (const key of COURSE_PROGRESS_STORAGE_KEYS) {
    const value = snapshot[key];
    if (typeof value === 'string') window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  }

  window.dispatchEvent(new Event('freightbridge:training-progress-updated'));
  window.dispatchEvent(new Event(TRAINING_STATE_UPDATED_EVENT));
}

export function clearTrainingSnapshot(notify = true): void {
  if (typeof window === 'undefined') return;
  for (const key of COURSE_PROGRESS_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
  if (notify) {
    window.dispatchEvent(new Event('freightbridge:training-progress-updated'));
    window.dispatchEvent(new Event(TRAINING_STATE_UPDATED_EVENT));
  }
}

export function notifyTrainingStateChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(TRAINING_STATE_UPDATED_EVENT));
}
