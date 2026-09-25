import type { TrainingProgress } from './types';

export const TRAINING_PROGRESS_STORAGE_KEY = 'freightbridge.trainingProgress';
export const TRAINING_PROGRESS_VERSION = 1;

const emptyProgress: TrainingProgress = {
  version: TRAINING_PROGRESS_VERSION,
  completedMissions: [],
};

export function loadTrainingProgress(): TrainingProgress {
  try {
    const stored = window.localStorage.getItem(TRAINING_PROGRESS_STORAGE_KEY);
    if (!stored) return emptyProgress;
    const parsed = JSON.parse(stored) as Partial<TrainingProgress>;
    if (parsed.version !== TRAINING_PROGRESS_VERSION || !Array.isArray(parsed.completedMissions)) {
      return emptyProgress;
    }
    return {
      version: TRAINING_PROGRESS_VERSION,
      completedMissions: parsed.completedMissions.filter((mission): mission is string => typeof mission === 'string'),
    };
  } catch {
    return emptyProgress;
  }
}

export function saveTrainingProgress(progress: TrainingProgress): void {
  window.localStorage.setItem(TRAINING_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
}

export function hasCompletedMission(progress: TrainingProgress, missionId: string): boolean {
  return progress.completedMissions.includes(missionId);
}

export function completeMission(missionId: string): TrainingProgress {
  const progress = loadTrainingProgress();
  if (progress.completedMissions.includes(missionId)) {
    return progress;
  }
  const nextProgress = {
    ...progress,
    completedMissions: [...progress.completedMissions, missionId],
  };
  saveTrainingProgress(nextProgress);
  return nextProgress;
}
