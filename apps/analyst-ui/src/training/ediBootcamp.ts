export const EDI_BOOTCAMP_STORAGE_KEY = 'freightbridge.ediProtocolBootcamp';
export const EDI_BOOTCAMP_LESSON_COUNT = 7;

export type EdiBootcampState = {
  lesson: number;
  complete: boolean;
  completedAt?: string;
};

export function loadEdiBootcampState(): EdiBootcampState {
  if (typeof window === 'undefined') return { lesson: 1, complete: false };
  const raw = window.localStorage.getItem(EDI_BOOTCAMP_STORAGE_KEY);
  if (!raw) return { lesson: 1, complete: false };

  try {
    const value = JSON.parse(raw) as Partial<EdiBootcampState>;
    const lesson = typeof value.lesson === 'number'
      ? Math.min(EDI_BOOTCAMP_LESSON_COUNT, Math.max(1, Math.round(value.lesson)))
      : 1;
    return {
      lesson,
      complete: value.complete === true,
      completedAt: typeof value.completedAt === 'string' ? value.completedAt : undefined,
    };
  } catch {
    return { lesson: 1, complete: false };
  }
}

export function saveEdiBootcampLesson(lesson: number): void {
  if (typeof window === 'undefined') return;
  const current = loadEdiBootcampState();
  window.localStorage.setItem(
    EDI_BOOTCAMP_STORAGE_KEY,
    JSON.stringify({
      ...current,
      lesson: Math.min(EDI_BOOTCAMP_LESSON_COUNT, Math.max(1, Math.round(lesson))),
    }),
  );
}

export function isEdiBootcampComplete(): boolean {
  return loadEdiBootcampState().complete;
}

export function completeEdiBootcamp(): void {
  if (typeof window === 'undefined') return;
  const current = loadEdiBootcampState();
  window.localStorage.setItem(
    EDI_BOOTCAMP_STORAGE_KEY,
    JSON.stringify({
      ...current,
      lesson: EDI_BOOTCAMP_LESSON_COUNT,
      complete: true,
      completedAt: current.completedAt ?? new Date().toISOString(),
    }),
  );
}
