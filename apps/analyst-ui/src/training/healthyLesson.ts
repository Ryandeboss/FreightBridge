export const HEALTHY_LESSON_STORAGE_KEY = 'freightbridge.healthyLesson';
export const HEALTHY_LESSON_SCENE_COUNT = 5;

export type HealthyLessonState = {
  scene: number;
  complete: boolean;
  completedAt?: string;
};

export function loadHealthyLessonState(): HealthyLessonState {
  if (typeof window === 'undefined') return { scene: 1, complete: false };
  const raw = window.localStorage.getItem(HEALTHY_LESSON_STORAGE_KEY);
  if (!raw) return { scene: 1, complete: false };

  try {
    const value = JSON.parse(raw) as Partial<HealthyLessonState>;
    const scene = typeof value.scene === 'number'
      ? Math.min(HEALTHY_LESSON_SCENE_COUNT, Math.max(1, Math.round(value.scene)))
      : 1;
    return {
      scene,
      complete: value.complete === true,
      completedAt: typeof value.completedAt === 'string' ? value.completedAt : undefined,
    };
  } catch {
    return { scene: 1, complete: false };
  }
}

export function saveHealthyLessonScene(scene: number): void {
  if (typeof window === 'undefined') return;
  const current = loadHealthyLessonState();
  window.localStorage.setItem(
    HEALTHY_LESSON_STORAGE_KEY,
    JSON.stringify({
      ...current,
      scene: Math.min(HEALTHY_LESSON_SCENE_COUNT, Math.max(1, Math.round(scene))),
    }),
  );
}

export function completeHealthyLesson(): void {
  if (typeof window === 'undefined') return;
  const current = loadHealthyLessonState();
  window.localStorage.setItem(
    HEALTHY_LESSON_STORAGE_KEY,
    JSON.stringify({
      ...current,
      scene: HEALTHY_LESSON_SCENE_COUNT,
      complete: true,
      completedAt: current.completedAt ?? new Date().toISOString(),
    }),
  );
}
