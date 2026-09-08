import type { FindingStatus, Severity } from '@prisma/client';

/** Deadline defaults, overridable per organization via SeverityPolicy rows. */
export const DEFAULT_SEVERITY_HOURS: Record<Severity, number> = {
  CRITICAL: 24, // 24 hours
  HIGH: 72, // 3 days
  MEDIUM: 168, // 7 days
  LOW: 336, // 14 days
};

export const DEFAULT_SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: '#91183E',
  HIGH: '#BE2C2C',
  MEDIUM: '#B47908',
  LOW: '#5A6474',
};

export function dueDateFor(createdAt: Date, hours: number): Date {
  return new Date(createdAt.getTime() + hours * 3600 * 1000);
}

export type DeadlineState = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'CLOSED';

export const DEADLINE_LABELS: Record<DeadlineState, string> = {
  ON_TRACK: 'On Track',
  DUE_SOON: 'Due Soon',
  OVERDUE: 'Overdue',
  CLOSED: 'Closed',
};

/** Statuses that mean the finding no longer consumes anyone's attention. */
export const TERMINAL_STATUSES: FindingStatus[] = ['CLOSED', 'CANCELLED'];

export function isTerminal(status: FindingStatus) {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * A finding is Overdue past its due date, Due Soon inside the warning window,
 * otherwise On Track. Closed and cancelled findings are never overdue — the
 * clock stops when the issue is actually resolved, not when someone says it is.
 */
export function deadlineState(
  finding: { dueDate: Date; status: FindingStatus },
  dueSoonHours: number,
  now: Date = new Date(),
): DeadlineState {
  if (isTerminal(finding.status)) return 'CLOSED';
  const remainingMs = finding.dueDate.getTime() - now.getTime();
  if (remainingMs < 0) return 'OVERDUE';
  if (remainingMs <= dueSoonHours * 3600 * 1000) return 'DUE_SOON';
  return 'ON_TRACK';
}

export function daysRemaining(dueDate: Date, now: Date = new Date()): number {
  return Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000);
}

export function describeRemaining(dueDate: Date, status: FindingStatus, now: Date = new Date()) {
  if (isTerminal(status)) return '—';
  const ms = dueDate.getTime() - now.getTime();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);

  const magnitude = days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  return overdue ? `${magnitude} overdue` : `${magnitude} left`;
}

// ---------------------------------------------------------------------------
// Escalation ladder
// ---------------------------------------------------------------------------

export const ESCALATION_LEVELS = [
  { level: 0, label: 'Responsible Person' },
  { level: 1, label: 'Branch Manager' },
  { level: 2, label: 'Regional Manager' },
  { level: 3, label: 'Head Office' },
] as const;

export function escalationLabel(level: number) {
  return ESCALATION_LEVELS[Math.min(Math.max(level, 0), 3)].label;
}

/**
 * How far a finding should have escalated by now: one step per configured
 * interval past the deadline, capped at Head Office.
 */
export function targetEscalationLevel(
  finding: { dueDate: Date; status: FindingStatus },
  escalateEveryHours: number,
  now: Date = new Date(),
): number {
  if (isTerminal(finding.status)) return 0;
  const overdueMs = now.getTime() - finding.dueDate.getTime();
  if (overdueMs <= 0) return 0;
  const interval = Math.max(escalateEveryHours, 1) * 3600 * 1000;
  return Math.min(3, Math.floor(overdueMs / interval) + 1);
}
