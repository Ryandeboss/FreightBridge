import { notifyTrainingStateChanged } from './sync';

export const FIRST_DAY_ORIENTATION_STORAGE_KEY = 'freightbridge.firstDayOrientationComplete';

export function isFirstDayOrientationComplete(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(FIRST_DAY_ORIENTATION_STORAGE_KEY) === 'true';
}

export function markFirstDayOrientationComplete(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FIRST_DAY_ORIENTATION_STORAGE_KEY, 'true');
  notifyTrainingStateChanged();
}
