import type { Metadata } from 'next';
import Link from 'next/link';

import { prisma } from '@/lib/db';
import { findingScope, requirePage } from '@/lib/auth/guard';
import { orgConfig } from '@/lib/domain/settings';
import { deadlineState, describeRemaining } from '@/lib/domain/deadlines';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { Card, EmptyState, PageHeader, Stat, TableWrap } from '@/components/ui/shell';
import { Badge, DeadlineBadge, RecurringBadge, SeverityBadge } from '@/components/ui/badges';

export const metadata: Metadata = { title: 'Verification queue' };
export const dynamic = 'force-dynamic';

/**
 * The verifier's worklist: findings whose owner claims the work is done and
 * which are waiting for someone to check the evidence before they can close.
 */
export default async function VerificationPage() {
  const user = await requirePage('finding:verify');
  const cfg = await orgConfig(user.organizationId);
  const scope = await findingScope(user);
  const now = new Date();

  const [pending, rejectedCount, closedByMe] = await Promise.all([
    prisma.finding.findMany({
      where: { ...scope, status: 'UNDER_VERIFICATION' },
      orderBy: [{ severity: 'asc' }, { evidenceSubmittedAt: 'asc' }],
      include: {
        branch: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { name: true } },
        correctiveActions: {
          orderBy: { attempt: 'desc' },
          take: 1,
          include: { submittedBy: { select: { name: true } } },
        },
        _count: { select: { evidence: true } },
      },
    }),
    prisma.finding.count({ where: { ...scope, rejectionCount: { gt: 0 }, status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
    prisma.finding.count({ where: { ...scope, closedById: user.id } }),
  ]);

  const oldest = pending[0]?.evidenceSubmittedAt ?? null;

  return (
    <>
      <PageHeader
        title="Verification queue"
        description="Corrective actions waiting for evidence to be checked. Nothing closes until someone verifies it."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Awaiting verification"
          value={pending.length}
          tone={pending.length > 0 ? 'accent' : 'ok'}
        />
        <Stat
          label="Oldest in queue"
          value={oldest ? relativeTime(oldest) : '—'}
          hint="Since evidence was submitted"
        />
        <Stat
          label="In rework"
          value={rejectedCount}
          hint="Evidence rejected at least once"
          tone={rejectedCount > 0 ? 'warn' : 'ok'}
        />
        <Stat label="Closed by you" value={closedByMe} tone="ok" />
      </div>

      <Card bodyClassName="">
        {pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting for verification"
            description="Every submitted corrective action has been reviewed."
          />
        ) : (
          <TableWrap minWidth={940}>
            <thead>
              <tr>
                <th className="th">Finding</th>
                <th className="th">Branch</th>
                <th className="th">Category / Item</th>
                <th className="th">Severity</th>
                <th className="th">Submitted</th>
                <th className="th">Deadline</th>
                <th className="th text-right">Evidence</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((f) => {
                const attempt = f.correctiveActions[0];
                return (
                  <tr key={f.id} className="row-link">
                    <td className="td">
                      <Link href={`/findings/${f.id}`} className="font-mono text-xs text-accent hover:underline">
                        {f.number}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {f.isRecurring && <RecurringBadge count={f.recurrenceCount} />}
                        {f.rejectionCount > 0 && (
                          <Badge tone="warn">Rework ×{f.rejectionCount}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="td">
                      <Link href={`/branches/${f.branchId}`} className="hover:text-accent hover:underline">
                        {f.branch.name}
                      </Link>
                      <div className="text-2xs text-muted">{f.branch.code}</div>
                    </td>
                    <td className="td max-w-[20rem]">
                      <div className="text-2xs uppercase tracking-wide text-faint">{f.categoryName}</div>
                      <div className="truncate" title={f.itemText}>
                        {f.itemText}
                      </div>
                    </td>
                    <td className="td">
                      <SeverityBadge severity={f.severity} />
                    </td>
                    <td className="td whitespace-nowrap text-muted">
                      {f.evidenceSubmittedAt ? fmtDateTime(f.evidenceSubmittedAt) : '—'}
                      {attempt && (
                        <div className="text-2xs text-faint">by {attempt.submittedBy.name}</div>
                      )}
                    </td>
                    <td className="td">
                      <DeadlineBadge
                        state={deadlineState(f, cfg.dueSoonHours, now)}
                        detail={describeRemaining(f.dueDate, f.status, now)}
                      />
                    </td>
                    <td className="td text-right tabular-nums">{f._count.evidence}</td>
                    <td className="td text-right">
                      <Link href={`/findings/${f.id}`} className="btn-primary py-1 text-xs">
                        Review
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
