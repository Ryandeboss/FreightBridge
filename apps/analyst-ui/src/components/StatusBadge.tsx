import { labelFromKey } from '../utils/formatting';

type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

const statusTone: Record<string, BadgeTone> = {
  SUCCEEDED: 'success',
  ACCEPTED: 'success',
  DELIVERED: 'success',
  READY: 'success',
  FAILED: 'danger',
  REJECTED: 'danger',
  ERROR: 'danger',
  PROCESSING: 'warning',
  PENDING: 'warning',
  OPEN: 'danger',
  RESOLVED: 'success',
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = value?.toUpperCase() ?? 'UNKNOWN';
  const tone = statusTone[normalized] ?? 'neutral';

  return <span className={`badge badge-${tone}`}>{labelFromKey(normalized)}</span>;
}

export function BooleanBadge({ value, trueLabel, falseLabel }: { value: boolean; trueLabel: string; falseLabel: string }) {
  return <span className={`badge ${value ? 'badge-warning' : 'badge-neutral'}`}>{value ? trueLabel : falseLabel}</span>;
}
