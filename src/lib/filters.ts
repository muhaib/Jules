import type { FindingStatus, Severity } from '@prisma/client';

export type SearchParams = Record<string, string | string[] | undefined>;

export function str(params: SearchParams, key: string): string | undefined {
  const v = params[key];
  const value = Array.isArray(v) ? v[0] : v;
  return value && value.length > 0 ? value : undefined;
}

export function date(params: SearchParams, key: string): Date | undefined {
  const v = str(params, key);
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function num(params: SearchParams, key: string, fallback: number): number {
  const v = Number(str(params, key));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export function severity(params: SearchParams, key = 'severity'): Severity | undefined {
  const v = str(params, key);
  return v && SEVERITIES.includes(v as Severity) ? (v as Severity) : undefined;
}

const STATUSES: FindingStatus[] = [
  'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'EVIDENCE_SUBMITTED',
  'UNDER_VERIFICATION', 'REJECTED', 'CLOSED', 'CANCELLED',
];
export function findingStatus(params: SearchParams, key = 'status'): FindingStatus | undefined {
  const v = str(params, key);
  return v && STATUSES.includes(v as FindingStatus) ? (v as FindingStatus) : undefined;
}

/** "to" is inclusive of the whole day the user picked. */
export function endOfDay(d: Date | undefined) {
  if (!d) return undefined;
  const end = new Date(d);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}
