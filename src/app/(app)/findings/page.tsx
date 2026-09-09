import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { findingScope, requirePage } from '@/lib/auth/guard';
import { filterOptions } from '@/lib/analytics';
import { orgConfig } from '@/lib/domain/settings';
import { deadlineState, describeRemaining } from '@/lib/domain/deadlines';
import { seriesTotals } from '@/lib/domain/recurrence-stats';
import { fmtDate } from '@/lib/format';
import { date, endOfDay, findingStatus, num, severity, str, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, PageHeader, TableWrap } from '@/components/ui/shell';
import { Pagination } from '@/components/ui/pagination';
import {
  DeadlineBadge,
  FindingStatusBadge,
  RecurringBadge,
  SeverityBadge,
} from '@/components/ui/badges';
import { FilterBar } from '@/components/filter-bar';

export const metadata: Metadata = { title: 'Findings' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function FindingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage('finding:view');
  const params = await searchParams;
  const cfg = await orgConfig(user.organizationId);
  const now = new Date();

  const page = num(params, 'page', 1);
  const statusParam = str(params, 'status');
  const deadline = str(params, 'deadline');
  const branchId = str(params, 'branchId');
  const category = str(params, 'category');
  const sev = severity(params);
  const from = date(params, 'from');
  const to = endOfDay(date(params, 'to'));
  const mine = str(params, 'mine') === '1';

  const scope = await findingScope(user);

  const where: Prisma.FindingWhereInput = {
    ...scope,
    ...(branchId ? { branchId } : {}),
    ...(category ? { categoryName: category } : {}),
    ...(sev ? { severity: sev } : {}),
    ...(mine ? { assignedToId: user.id } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(statusParam === 'open'
      ? { status: { notIn: ['CLOSED', 'CANCELLED'] } }
      : findingStatus(params)
        ? { status: findingStatus(params) }
        : {}),
    ...(deadline === 'overdue'
      ? { dueDate: { lt: now }, status: { notIn: ['CLOSED', 'CANCELLED'] } }
      : deadline === 'due_soon'
        ? {
            dueDate: { gte: now, lte: new Date(now.getTime() + cfg.dueSoonHours * 3600 * 1000) },
            status: { notIn: ['CLOSED', 'CANCELLED'] },
          }
        : {}),
    ...(str(params, 'recurring') === '1' ? { isRecurring: true } : {}),
  };

  const [total, findings, options] = await Promise.all([
    prisma.finding.count({ where }),
    prisma.finding.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: [{ severity: 'asc' }, { dueDate: 'asc' }],
      include: {
        branch: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { evidence: true } },
      },
    }),
    filterOptions(user),
  ]);

  // One grouped query resolves the true series size for the rows on this page.
  const totals = await seriesTotals(user.organizationId, findings.map((f) => f.recurrenceKey));

  const carried: Record<string, string | undefined> = {
    status: statusParam,
    deadline,
    branchId,
    category,
    severity: sev,
    from: str(params, 'from'),
    to: str(params, 'to'),
    mine: mine ? '1' : undefined,
    recurring: str(params, 'recurring'),
  };

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every non-compliance, who owns it, when it is due, and whether the fix was verified."
        actions={
          <>
            <Link href="/findings?deadline=overdue" className="btn-secondary">
              Overdue only
            </Link>
            <Link href="/api/v1/exports/findings.xlsx" className="btn-secondary" prefetch={false}>
              Export Excel
            </Link>
          </>
        }
      />

      <FilterBar
        filters={[
          {
            name: 'status',
            label: 'Status',
            options: [
              { value: 'open', label: 'All open' },
              { value: 'OPEN', label: 'Open' },
              { value: 'ASSIGNED', label: 'Assigned' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'UNDER_VERIFICATION', label: 'Under Verification' },
              { value: 'CLOSED', label: 'Closed' },
            ],
          },
          {
            name: 'severity',
            label: 'Severity',
            options: [
              { value: 'CRITICAL', label: 'Critical' },
              { value: 'HIGH', label: 'High' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'LOW', label: 'Low' },
            ],
          },
          {
            name: 'deadline',
            label: 'Deadline',
            options: [
              { value: 'overdue', label: 'Overdue' },
              { value: 'due_soon', label: 'Due soon' },
            ],
          },
          {
            name: 'branchId',
            label: 'Branch',
            options: options.branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
          },
          {
            name: 'category',
            label: 'Category',
            options: options.categories.map((c) => ({ value: c, label: c })),
          },
          {
            name: 'recurring',
            label: 'Recurrence',
            options: [{ value: '1', label: 'Recurring only' }],
          },
          { name: 'mine', label: 'Assignment', options: [{ value: '1', label: 'Assigned to me' }] },
        ]}
      />

      <Card bodyClassName="">
        {findings.length === 0 ? (
          <EmptyState
            title="No findings match these filters"
            description="Adjust the filters above, or clear them to see everything in your scope."
          />
        ) : (
          <>
            <TableWrap minWidth={980}>
              <thead>
                <tr>
                  <th className="th">Finding</th>
                  <th className="th">Branch</th>
                  <th className="th">Category / Item</th>
                  <th className="th">Severity</th>
                  <th className="th">Status</th>
                  <th className="th">Owner</th>
                  <th className="th">Due</th>
                  <th className="th">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f) => (
                  <tr key={f.id} className="row-link">
                    <td className="td">
                      <Link
                        href={`/findings/${f.id}`}
                        className="font-mono text-xs font-medium text-accent hover:underline"
                      >
                        {f.number}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {f.isRecurring && (
                          <RecurringBadge count={totals.get(f.recurrenceKey) ?? f.recurrenceCount} />
                        )}
                        {f._count.evidence > 0 && (
                          <span className="text-2xs text-muted">{f._count.evidence} photo(s)</span>
                        )}
                      </div>
                    </td>
                    <td className="td">
                      <Link href={`/branches/${f.branchId}`} className="hover:text-accent hover:underline">
                        {f.branch.name}
                      </Link>
                      <div className="text-2xs text-muted">{f.branch.code}</div>
                    </td>
                    <td className="td max-w-[22rem]">
                      <div className="text-2xs uppercase tracking-wide text-faint">
                        {f.categoryName}
                      </div>
                      <div className="truncate" title={f.itemText}>
                        {f.itemText}
                      </div>
                    </td>
                    <td className="td">
                      <SeverityBadge severity={f.severity} />
                    </td>
                    <td className="td">
                      <FindingStatusBadge status={f.status} />
                    </td>
                    <td className="td text-muted">{f.assignedTo?.name ?? 'Unassigned'}</td>
                    <td className="td whitespace-nowrap text-muted">{fmtDate(f.dueDate)}</td>
                    <td className="td">
                      <DeadlineBadge
                        state={deadlineState(f, cfg.dueSoonHours, now)}
                        detail={describeRemaining(f.dueDate, f.status, now)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              basePath="/findings"
              params={carried}
            />
          </>
        )}
      </Card>
    </>
  );
}
