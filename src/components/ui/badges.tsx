import clsx from 'clsx';
import type { FindingStatus, InspectionStatus, ResponseResult, Severity } from '@prisma/client';

import type { DeadlineState } from '@/lib/domain/deadlines';
import { RESULT_LABEL, SEVERITY_LABEL, STATUS_LABEL } from '@/lib/format';

/** One badge primitive; every status pill in the app is built from it. */
export function Badge({
  children,
  tone = 'neutral',
  className,
  dot = false,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'crit' | 'info' | 'accent';
  className?: string;
  dot?: boolean;
}) {
  const tones = {
    neutral: 'bg-raised text-muted border-line',
    ok: 'bg-ok/10 text-ok border-ok/25',
    warn: 'bg-warn/10 text-warn border-warn/25',
    bad: 'bg-bad/10 text-bad border-bad/25',
    crit: 'bg-crit/10 text-crit border-crit/30',
    info: 'bg-info/10 text-info border-info/25',
    accent: 'bg-accent-soft text-accent border-accent/25',
  } as const;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-2xs font-medium',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const SEVERITY_TONE: Record<Severity, 'crit' | 'bad' | 'warn' | 'neutral'> = {
  CRITICAL: 'crit',
  HIGH: 'bad',
  MEDIUM: 'warn',
  LOW: 'neutral',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Badge tone={SEVERITY_TONE[severity]} dot>
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}

const FINDING_TONE: Record<FindingStatus, 'neutral' | 'info' | 'warn' | 'ok' | 'bad' | 'accent'> = {
  OPEN: 'bad',
  ASSIGNED: 'warn',
  IN_PROGRESS: 'info',
  EVIDENCE_SUBMITTED: 'accent',
  UNDER_VERIFICATION: 'accent',
  REJECTED: 'bad',
  CLOSED: 'ok',
  CANCELLED: 'neutral',
};

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  return <Badge tone={FINDING_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

const DEADLINE_TONE: Record<DeadlineState, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  ON_TRACK: 'ok',
  DUE_SOON: 'warn',
  OVERDUE: 'bad',
  CLOSED: 'neutral',
};

const DEADLINE_TEXT: Record<DeadlineState, string> = {
  ON_TRACK: 'On Track',
  DUE_SOON: 'Due Soon',
  OVERDUE: 'Overdue',
  CLOSED: 'Closed',
};

export function DeadlineBadge({ state, detail }: { state: DeadlineState; detail?: string }) {
  return (
    <Badge tone={DEADLINE_TONE[state]} dot>
      {DEADLINE_TEXT[state]}
      {detail && state !== 'CLOSED' ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </Badge>
  );
}

const INSPECTION_TONE: Record<InspectionStatus, 'neutral' | 'info' | 'warn' | 'ok'> = {
  DRAFT: 'neutral',
  ASSIGNED: 'warn',
  IN_PROGRESS: 'info',
  SUBMITTED: 'ok',
  CANCELLED: 'neutral',
};

const INSPECTION_TEXT: Record<InspectionStatus, string> = {
  DRAFT: 'Draft',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  CANCELLED: 'Cancelled',
};

export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  return <Badge tone={INSPECTION_TONE[status]}>{INSPECTION_TEXT[status]}</Badge>;
}

const RESULT_TONE: Record<ResponseResult, 'ok' | 'warn' | 'bad' | 'neutral'> = {
  COMPLIANT: 'ok',
  PARTIALLY_COMPLIANT: 'warn',
  NON_COMPLIANT: 'bad',
  NOT_APPLICABLE: 'neutral',
};

export function ResultBadge({ result }: { result: ResponseResult }) {
  return <Badge tone={RESULT_TONE[result]}>{RESULT_LABEL[result]}</Badge>;
}

/** Compliance score with its grade band. Colour carries the same meaning everywhere. */
export function ScoreBadge({
  score,
  bands,
  size = 'sm',
}: {
  score: number | null | undefined;
  bands?: { bandExcellent: number; bandGood: number; bandNeedsWork: number };
  size?: 'sm' | 'lg';
}) {
  if (score === null || score === undefined) {
    return <span className="text-faint">—</span>;
  }
  const b = bands ?? { bandExcellent: 90, bandGood: 80, bandNeedsWork: 70 };
  const tone =
    score >= b.bandExcellent ? 'ok' : score >= b.bandGood ? 'accent' : score >= b.bandNeedsWork ? 'warn' : 'bad';
  const label =
    score >= b.bandExcellent
      ? 'Excellent'
      : score >= b.bandGood
        ? 'Good'
        : score >= b.bandNeedsWork
          ? 'Needs Improvement'
          : 'Poor';

  if (size === 'lg') {
    const colors = {
      ok: 'text-ok',
      accent: 'text-accent',
      warn: 'text-warn',
      bad: 'text-bad',
    } as const;
    return (
      <div>
        <div className={clsx('text-3xl font-semibold tabular-nums', colors[tone])}>
          {score.toFixed(1)}%
        </div>
        <div className="mt-1 text-xs text-muted">{label}</div>
      </div>
    );
  }

  return (
    <Badge tone={tone} className="tabular-nums">
      {score.toFixed(1)}%
    </Badge>
  );
}

export function RecurringBadge({ count }: { count: number }) {
  return (
    <Badge tone="crit" className="uppercase tracking-wide">
      Recurring ×{count}
    </Badge>
  );
}
