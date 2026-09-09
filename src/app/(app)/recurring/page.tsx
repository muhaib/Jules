import type { Metadata } from 'next';
import Link from 'next/link';

import { requirePage, branchScope } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { recurringFindings } from '@/lib/analytics';
import { FINDING_STATUS_LABELS } from '@/lib/domain/findings';
import { fmtDate, fmtMonth } from '@/lib/format';
import { Card, EmptyState, PageHeader, Stat } from '@/components/ui/shell';
import { Badge, RecurringBadge } from '@/components/ui/badges';

export const metadata: Metadata = { title: 'Recurring issues' };
export const dynamic = 'force-dynamic';

/**
 * Repeat offenders. A finding that keeps coming back at the same branch is a
 * systemic failure, not a one-time defect, and is presented differently so it
 * does not get lost in the general findings queue.
 */
export default async function RecurringPage() {
  const user = await requirePage('analytics:view');
  const scope = await branchScope(user);
  const branches = await prisma.branch.findMany({ where: scope, select: { id: true } });
  const series = await recurringFindings(user, branches.map((b) => b.id), 60);

  const stillOpen = series.filter((s) =>
    s.occurrences.some((o) => o.status !== 'CLOSED' && o.status !== 'CANCELLED'),
  );
  const branchesAffected = new Set(series.map((s) => s.branch.id)).size;
  const totalOccurrences = series.reduce((n, s) => n + s.occurrences.length, 0);

  return (
    <>
      <PageHeader
        title="Recurring issues"
        description="The same checklist item failing repeatedly at the same branch. Closing one occurrence does not fix the cause."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recurring series" value={series.length} tone={series.length > 0 ? 'crit' : 'ok'} />
        <Stat label="Still open" value={stillOpen.length} tone={stillOpen.length > 0 ? 'bad' : 'ok'} />
        <Stat label="Branches affected" value={branchesAffected} />
        <Stat label="Total occurrences" value={totalOccurrences} />
      </div>

      {series.length === 0 ? (
        <Card>
          <EmptyState
            title="No recurring issues detected"
            description={`An issue is flagged once the same checklist item has failed ${user ? '' : ''}at a branch enough times to meet your organization's recurrence threshold.`}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {series.map((s) => {
            const open = s.occurrences.filter(
              (o) => o.status !== 'CLOSED' && o.status !== 'CANCELLED',
            );
            return (
              <section key={s.key} className="card">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <RecurringBadge count={s.occurrences.length} />
                      {open.length > 0 ? (
                        <Badge tone="bad">{open.length} still open</Badge>
                      ) : (
                        <Badge tone="ok">All occurrences closed</Badge>
                      )}
                      <span className="text-2xs uppercase tracking-wide text-faint">
                        {s.categoryName}
                      </span>
                    </div>
                    <h2 className="text-sm font-semibold text-ink">{s.itemText}</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      <Link href={`/branches/${s.branch.id}`} className="hover:text-accent hover:underline">
                        {s.branch.name}
                      </Link>{' '}
                      ({s.branch.code}) · last seen {fmtDate(s.lastSeen)}
                    </p>
                  </div>
                  <p className="shrink-0 rounded border border-crit/25 bg-crit/5 px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-crit">
                    Management attention required
                  </p>
                </header>

                <div className="px-4 py-3 sm:px-5">
                  <p className="mb-2.5 text-xs text-muted">Detected in:</p>
                  <ol className="flex flex-wrap gap-2">
                    {s.occurrences.map((o) => {
                      const closed = o.status === 'CLOSED';
                      return (
                        <li key={o.id}>
                          <Link
                            href={`/findings/${o.id}`}
                            className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors hover:border-accent ${
                              closed ? 'border-line bg-raised text-muted' : 'border-bad/25 bg-bad/5 text-bad'
                            }`}
                          >
                            <span className="font-medium">{fmtMonth(o.createdAt)}</span>
                            <span className="font-mono text-2xs opacity-70">{o.number}</span>
                            <span className="text-2xs">{FINDING_STATUS_LABELS[o.status]}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
