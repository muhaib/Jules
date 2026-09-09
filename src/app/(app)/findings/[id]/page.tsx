import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound as nextNotFound } from 'next/navigation';
import clsx from 'clsx';

import { prisma } from '@/lib/db';
import { can, findingScope, requirePage } from '@/lib/auth/guard';
import { orgConfig } from '@/lib/domain/settings';
import {
  deadlineState,
  describeRemaining,
  ESCALATION_LEVELS,
  escalationLabel,
} from '@/lib/domain/deadlines';
import { FINDING_STATUS_LABELS, LIFECYCLE_STEPS } from '@/lib/domain/findings';
import { auditLabel } from '@/lib/audit';
import { fmtDate, fmtDateTime, relativeTime } from '@/lib/format';
import { Card, Field, PageHeader, TableWrap } from '@/components/ui/shell';
import {
  Badge,
  DeadlineBadge,
  FindingStatusBadge,
  RecurringBadge,
  SeverityBadge,
} from '@/components/ui/badges';
import { EvidenceGallery } from '@/components/evidence-gallery';
import { FindingActions } from '@/components/finding-actions';
import { ROLE_LABELS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const finding = await prisma.finding.findUnique({ where: { id }, select: { number: true } });
  return { title: finding ? `Finding ${finding.number}` : 'Finding' };
}

export default async function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage('finding:view');
  const { id } = await params;
  const scope = await findingScope(user);
  const cfg = await orgConfig(user.organizationId);

  const finding = await prisma.finding.findFirst({
    where: { ...scope, id },
    include: {
      branch: { select: { id: true, name: true, code: true, city: true } },
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      createdBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      inspection: { select: { id: true, reference: true, submittedAt: true } },
      evidence: {
        orderBy: { capturedAt: 'asc' },
        include: { uploadedBy: { select: { name: true } } },
      },
      correctiveActions: {
        orderBy: { attempt: 'desc' },
        include: {
          submittedBy: { select: { name: true } },
          verifiedBy: { select: { name: true } },
        },
      },
    },
  });

  if (!finding) nextNotFound();

  const [history, trail, people] = await Promise.all([
    prisma.finding.findMany({
      where: {
        organizationId: user.organizationId,
        recurrenceKey: finding.recurrenceKey,
        id: { not: finding.id },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, createdAt: true, status: true, severity: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId: user.organizationId, entityType: 'Finding', entityId: finding.id },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        role: { in: ['BRANCH_MANAGER', 'REGIONAL_MANAGER', 'SUPER_ADMIN'] },
      },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const state = deadlineState(finding, cfg.dueSoonHours);
  const stepIndex = LIFECYCLE_STEPS.indexOf(finding.status);

  // The stored recurrenceCount is this finding's position in the series when it
  // was raised; the series may have grown since. Count it as it stands now.
  const occurrences = history.length + 1;

  // For a closed finding, whether the deadline was actually met is the useful
  // fact — repeating "Closed" next to the status badge is not.
  const closedOnTime =
    finding.closedAt !== null ? finding.closedAt.getTime() <= finding.dueDate.getTime() : null;

  const permissions = {
    assign: can(user, 'finding:assign'),
    respond:
      can(user, 'finding:respond') &&
      (finding.assignedToId === user.id || user.role === 'BRANCH_MANAGER' || user.role === 'SUPER_ADMIN'),
    verify: can(user, 'finding:verify'),
  };

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: 'Findings', href: '/findings' },
          { label: finding.number },
        ]}
        title={finding.itemText}
        description={`${finding.categoryName} · ${finding.branch.name} (${finding.branch.code})`}
        actions={
          <>
            <SeverityBadge severity={finding.severity} />
            <FindingStatusBadge status={finding.status} />
            {closedOnTime === null ? (
              <DeadlineBadge state={state} detail={describeRemaining(finding.dueDate, finding.status)} />
            ) : (
              <Badge tone={closedOnTime ? 'ok' : 'bad'} dot>
                {closedOnTime ? 'Closed within deadline' : 'Closed after deadline'}
              </Badge>
            )}
          </>
        }
      />

      {finding.isRecurring && (
        <div className="mb-5 rounded-lg border border-crit/25 bg-crit/5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <RecurringBadge count={occurrences} />
            <p className="text-sm font-medium text-crit">Management attention required</p>
          </div>
          <p className="mt-1.5 text-sm text-ink">
            &ldquo;{finding.itemText}&rdquo; has failed {occurrences} times at{' '}
            {finding.branch.name}. A repeat failure is a systemic problem, not a one-time defect —
            closing this occurrence without addressing the cause will not stop the next one.
          </p>
          {history.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              {history.map((h) => (
                <li key={h.id}>
                  <Link href={`/findings/${h.id}`} className="font-mono hover:text-crit hover:underline">
                    {h.number}
                  </Link>{' '}
                  · {fmtDate(h.createdAt)} · {FINDING_STATUS_LABELS[h.status]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Lifecycle tracker */}
      <Card className="mb-5" title="Corrective action lifecycle">
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-3">
          {LIFECYCLE_STEPS.map((step, i) => {
            const done = stepIndex >= 0 && i <= stepIndex;
            const current = i === stepIndex;
            return (
              <li key={step} className="flex items-center gap-1">
                <span
                  className={clsx(
                    'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs',
                    current
                      ? 'border-accent bg-accent text-white'
                      : done
                        ? 'border-ok/30 bg-ok/10 text-ok'
                        : 'border-line bg-raised text-faint',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold',
                      current ? 'bg-white/20' : done ? 'bg-ok/20' : 'bg-line',
                    )}
                  >
                    {done && !current ? '✓' : i + 1}
                  </span>
                  {FINDING_STATUS_LABELS[step]}
                </span>
                {i < LIFECYCLE_STEPS.length - 1 && <span className="text-faint">→</span>}
              </li>
            );
          })}
        </ol>

        {finding.rejectionCount > 0 && (
          <p className="mt-3 rounded-md border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
            Evidence has been rejected {finding.rejectionCount} time
            {finding.rejectionCount === 1 ? '' : 's'} on this finding — it re-entered the rework loop
            rather than closing.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Observation">
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{finding.observation}</p>
          </Card>

          <Card title="Evidence" description="Before and after, side by side">
            <EvidenceGallery
              items={finding.evidence.map((e) => ({
                id: e.id,
                kind: e.kind,
                caption: e.caption,
                mimeType: e.mimeType,
                capturedAt: e.capturedAt.toISOString(),
                latitude: e.latitude,
                longitude: e.longitude,
                uploadedBy: e.uploadedBy.name,
              }))}
            />
          </Card>

          {finding.correctiveActions.length > 0 && (
            <Card
              title="Corrective action attempts"
              description="Each rejection creates a new attempt — the full rework history is kept"
              bodyClassName=""
            >
              <ul className="divide-y divide-line">
                {finding.correctiveActions.map((ca) => (
                  <li key={ca.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">Attempt {ca.attempt}</span>
                      <Badge
                        tone={
                          ca.verdict === 'ACCEPTED' ? 'ok' : ca.verdict === 'REJECTED' ? 'bad' : 'accent'
                        }
                      >
                        {ca.verdict === 'PENDING' ? 'Awaiting verification' : ca.verdict.toLowerCase()}
                      </Badge>
                      <span className="ml-auto text-2xs text-muted">
                        {ca.submittedBy.name} · {fmtDateTime(ca.submittedAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-ink">{ca.description}</p>
                    {ca.actionTaken && <p className="mt-1 text-xs text-muted">{ca.actionTaken}</p>}
                    {ca.verifierComment && (
                      <div
                        className={clsx(
                          'mt-2.5 rounded-md border px-3 py-2 text-sm',
                          ca.verdict === 'REJECTED'
                            ? 'border-bad/25 bg-bad/5 text-bad'
                            : 'border-ok/25 bg-ok/5 text-ok',
                        )}
                      >
                        <span className="font-medium">
                          {ca.verdict === 'REJECTED' ? 'Rejected' : 'Verified'} by{' '}
                          {ca.verifiedBy?.name ?? 'verifier'}:
                        </span>{' '}
                        {ca.verifierComment}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Audit trail" description="Every state change, with who and when" bodyClassName="">
            <TableWrap minWidth={520}>
              <thead>
                <tr>
                  <th className="th">When</th>
                  <th className="th">Who</th>
                  <th className="th">Action</th>
                  <th className="th">Detail</th>
                </tr>
              </thead>
              <tbody>
                {trail.map((t) => (
                  <tr key={t.id}>
                    <td className="td whitespace-nowrap text-muted">{fmtDateTime(t.createdAt)}</td>
                    <td className="td">{t.actorLabel}</td>
                    <td className="td whitespace-nowrap">{auditLabel(t.action)}</td>
                    <td className="td text-muted">{t.summary}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Accountability">
            <dl className="divide-y divide-line">
              <Field label="Finding number">
                <span className="font-mono">{finding.number}</span>
              </Field>
              <Field label="Branch">
                <Link href={`/branches/${finding.branchId}`} className="text-accent hover:underline">
                  {finding.branch.name} ({finding.branch.code})
                </Link>
              </Field>
              <Field label="Responsible person">
                {finding.assignedTo ? (
                  <>
                    {finding.assignedTo.name}
                    <span className="block text-2xs text-muted">
                      {ROLE_LABELS[finding.assignedTo.role]} · {finding.assignedTo.email}
                    </span>
                  </>
                ) : (
                  <span className="text-bad">Unassigned</span>
                )}
              </Field>
              <Field label="Due date">
                {fmtDate(finding.dueDate)}
                <span className="block text-2xs text-muted">
                  {describeRemaining(finding.dueDate, finding.status)}
                </span>
              </Field>
              <Field label="Raised by">
                {finding.createdBy.name}
                <span className="block text-2xs text-muted">{fmtDateTime(finding.createdAt)}</span>
              </Field>
              {finding.inspection && (
                <Field label="Source inspection">
                  <Link
                    href={`/inspections/${finding.inspection.id}`}
                    className="font-mono text-accent hover:underline"
                  >
                    {finding.inspection.reference}
                  </Link>
                </Field>
              )}
              {finding.closedAt && (
                <Field label="Closed">
                  {fmtDateTime(finding.closedAt)}
                  <span className="block text-2xs text-muted">
                    Verified by {finding.closedBy?.name ?? 'verifier'}
                  </span>
                </Field>
              )}
            </dl>
          </Card>

          <Card title="Escalation" description={`Currently at: ${escalationLabel(finding.escalationLevel)}`}>
            <ol className="space-y-1.5">
              {ESCALATION_LEVELS.map((level) => {
                const reached = finding.escalationLevel >= level.level;
                return (
                  <li key={level.level} className="flex items-center gap-2 text-sm">
                    <span
                      className={clsx(
                        'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
                        reached ? 'bg-bad text-white' : 'bg-raised text-faint',
                      )}
                    >
                      {level.level + 1}
                    </span>
                    <span className={reached ? 'font-medium text-ink' : 'text-faint'}>{level.label}</span>
                    {finding.escalationLevel === level.level && level.level > 0 && (
                      <Badge tone="bad" className="ml-auto">
                        Current
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ol>
            {finding.lastEscalatedAt && (
              <p className="mt-3 text-2xs text-muted">
                Last escalated {relativeTime(finding.lastEscalatedAt)}
              </p>
            )}
          </Card>

          {(permissions.assign || permissions.respond || permissions.verify) && (
            <Card title="Actions">
              <FindingActions
                findingId={finding.id}
                status={finding.status}
                can={permissions}
                people={people.map((p) => ({ id: p.id, name: p.name, role: ROLE_LABELS[p.role] }))}
                currentAssigneeId={finding.assignedToId}
                currentDueDate={finding.dueDate.toISOString()}
                currentSeverity={finding.severity}
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
