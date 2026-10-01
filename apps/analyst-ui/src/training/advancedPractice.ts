import { notifyTrainingStateChanged } from './sync';

export const REPLAY_SEQUENCE_PRACTICE_STORAGE_KEY = 'freightbridge.replaySequencePracticeComplete';

export function isReplaySequencePracticeComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(REPLAY_SEQUENCE_PRACTICE_STORAGE_KEY) === 'true';
}

export function completeReplaySequencePractice(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(REPLAY_SEQUENCE_PRACTICE_STORAGE_KEY, 'true');
  notifyTrainingStateChanged();
}


export const INDEPENDENT_INVESTIGATION_STORAGE_KEY = 'freightbridge.independentInvestigationComplete';

export function isIndependentInvestigationComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(INDEPENDENT_INVESTIGATION_STORAGE_KEY) === 'true';
}

export function completeIndependentInvestigation(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(INDEPENDENT_INVESTIGATION_STORAGE_KEY, 'true');
  notifyTrainingStateChanged();
}
