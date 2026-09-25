import type { LabRun } from '../api/lab';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function findStep(run: LabRun | null, stepKey: string) {
  return run?.steps.find((step) => step.stepKey === stepKey) ?? null;
}

export function findApexPayload(run: LabRun | null): Record<string, unknown> {
  if (!run) return {};
  const step = findStep(run, 'CREATE_APEX_LOAD');
  const fromResponse = asRecord(step?.responseSummary.apexLoadTenderJson);
  const fromRequest = asRecord(step?.requestSummary.apexLoadTenderJson);
  return fromResponse ?? fromRequest ?? run.inputSnapshot;
}

export function find204Dispatch(run: LabRun | null): Record<string, unknown> | null {
  const step = findStep(run, 'DISPATCH_204_SFTP');
  return step?.responseSummary ?? null;
}

export function find204Preview(run: LabRun | null): Record<string, unknown> | null {
  const preview = find204Dispatch(run)?.x12Preview;
  return asRecord(preview);
}

export function findCanonicalShipment(run: LabRun | null): Record<string, unknown> {
  if (!run) return {};
  const fromSummary = asRecord(run.resultSummary.canonicalShipment);
  const fromDispatch = asRecord(find204Dispatch(run)?.canonicalShipment);
  return fromSummary ?? fromDispatch ?? {};
}

export function shipmentEvents(run: LabRun | null): Record<string, unknown>[] {
  const events = run?.resultSummary.shipmentEvents;
  return Array.isArray(events) ? events.filter((event): event is Record<string, unknown> => Boolean(asRecord(event))) : [];
}

export function locationLine(location: unknown): string {
  const record = asRecord(location);
  if (!record) return 'Pending';
  const facility = String(record.facilityName ?? '');
  const city = String(record.city ?? '');
  const state = String(record.state ?? '');
  return [facility, [city, state].filter(Boolean).join(', ')].filter(Boolean).join(' / ') || 'Pending';
}

export function rawEvidence(value: unknown): string {
  if (value === null || value === undefined) return 'Evidence pending.';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}
