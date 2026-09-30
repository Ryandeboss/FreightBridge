export const LEARNING_JOURNEY_STORAGE_KEY = 'freightbridge.learningJourneyStarted';

export function hasStartedLearningJourney(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.localStorage.getItem(LEARNING_JOURNEY_STORAGE_KEY) === 'true') return true;
  if (window.localStorage.getItem('freightbridge.firstDayOrientationComplete') === 'true') return true;
  if (window.localStorage.getItem('freightbridge.healthyWalkthrough')) return true;
  if (window.localStorage.getItem('freightbridge.trainingProgress')) return true;
  if (window.localStorage.getItem('freightbridge.replaySequencePracticeComplete') === 'true') return true;
  return false;
}

export function startLearningJourney(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LEARNING_JOURNEY_STORAGE_KEY, 'true');
}
