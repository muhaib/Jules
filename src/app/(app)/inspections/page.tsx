import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { can, inspectionScope, requirePage } from '@/lib/auth/guard';
import { filterOptions } from '@/lib/analytics';
import { orgConfig } from '@/lib/domain/settings';
import { fmtDate } from '@/lib/format';
import { date, endOfDay, num, str, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, PageHeader, TableWrap } from '@/components/ui/shell';
import { Pagination } from '@/components/ui/pagination';
import { InspectionStatusBadge, ScoreBadge } from '@/components/ui/badges';
import { FilterBar } from '@/components/filter-bar';

export const metadata: Metadata = { title: 'Inspections' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage('inspection:view');
  const params = await searchParams;
  const cfg = await orgConfig(user.organizationId);

  const page = num(params, 'page', 1);
  const status = str(params, 'status');
  const branchId = str(params, 'branchId');
  const inspectorId = str(params, 'inspectorId');
  const mine = str(params, 'mine') === '1';
  const from = date(params, 'from');
  const to = endOfDay(date(params, 'to'));

  const scope = await inspectionScope(user);
  const where: Prisma.InspectionWhereInput = {
    ...scope,
    ...(status ? { status: status as never } : {}),
    ...(branchId ? { branchId } : {}),
    ...(inspectorId ? { inspectorId } : {}),
    ...(mine ? { inspectorId: user.id } : {}),
    ...(from || to
      ? { scheduledFor: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
  };

  const [total, inspections, options] = await Promise.all([
    prisma.inspection.count({ where }),
    prisma.inspection.findMany({
      where,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      // Live work first, then the most recent completed inspections.
      orderBy: [{ status: 'asc' }, { scheduledFor: 'desc' }],
      include: {
        branch: { select: { id: true, name: true, code: true } },
        template: { select: { name: true } },
        inspector: { select: { name: true } },
        _count: { select: { findings: true } },
      },
    }),
    filterOptions(user),
  ]);

  const carried: Record<string, string | undefined> = {
    status,
    branchId,
    inspectorId,
    mine: mine ? '1' : undefined,
    from: str(params, 'from'),
    to: str(params, 'to'),
  };

  return (
    <>
      <PageHeader
        title="Inspections"
        description="Scheduled, in-progress and submitted branch inspections."
        actions={
          <>
            {user.role === 'INSPECTOR' && (
              <Link href="/inspections?mine=1&status=ASSIGNED" className="btn-secondary">
                My assignments
              </Link>
            )}
            {can(user, 'inspection:assign') && (
              <Link href="/inspections/new" className="btn-primary">
                Assign inspection
              </Link>
            )}
          </>
        }
      />

      <FilterBar
        filters={[
          {
            name: 'status',
            label: 'Status',
            options: [
              { value: 'ASSIGNED', label: 'Assigned' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'SUBMITTED', label: 'Submitted' },
              { value: 'CANCELLED', label: 'Cancelled' },
            ],
          },
          {
            name: 'branchId',
            label: 'Branch',
            options: options.branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
          },
          {
            name: 'inspectorId',
            label: 'Inspector',
            options: options.inspectors.map((i) => ({ value: i.id, label: i.name })),
          },
          { name: 'mine', label: 'Assignment', options: [{ value: '1', label: 'Assigned to me' }] },
        ]}
      />

      <Card bodyClassName="">
        {inspections.length === 0 ? (
          <EmptyState
            title="No inspections match these filters"
            description="Clear the filters, or assign a new inspection."
          />
        ) : (
          <>
            <TableWrap minWidth={940}>
              <thead>
                <tr>
                  <th className="th">Reference</th>
                  <th className="th">Branch</th>
                  <th className="th">Template</th>
                  <th className="th">Inspector</th>
                  <th className="th">Scheduled</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Score</th>
                  <th className="th text-right">Findings</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((i) => {
                  const runnable =
                    i.inspectorId === user.id && (i.status === 'ASSIGNED' || i.status === 'IN_PROGRESS');
                  return (
                    <tr key={i.id} className="row-link">
                      <td className="td">
                        <Link
                          href={`/inspections/${i.id}`}
                          className="font-mono text-xs font-medium text-accent hover:underline"
                        >
                          {i.reference}
                        </Link>
                      </td>
                      <td className="td">
                        <Link href={`/branches/${i.branchId}`} className="hover:text-accent hover:underline">
                          {i.branch.name}
                        </Link>
                        <div className="text-2xs text-muted">{i.branch.code}</div>
                      </td>
                      <td className="td text-muted">{i.template.name}</td>
                      <td className="td text-muted">{i.inspector.name}</td>
                      <td className="td whitespace-nowrap text-muted">{fmtDate(i.scheduledFor)}</td>
                      <td className="td">
                        <InspectionStatusBadge status={i.status} />
                      </td>
                      <td className="td text-right">
                        <ScoreBadge score={i.score} bands={cfg} />
                      </td>
                      <td className="td text-right tabular-nums">
                        {i.status === 'SUBMITTED' ? i._count.findings : '—'}
                      </td>
                      <td className="td text-right">
                        {runnable ? (
                          <Link href={`/inspections/${i.id}/run`} className="btn-primary py-1 text-xs">
                            {i.status === 'ASSIGNED' ? 'Start' : 'Continue'}
                          </Link>
                        ) : i.status === 'SUBMITTED' ? (
                          <Link
                            href={`/api/v1/inspections/${i.id}/report.pdf`}
                            prefetch={false}
                            className="text-xs text-accent hover:underline"
                          >
                            PDF
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              basePath="/inspections"
              params={carried}
            />
          </>
        )}
      </Card>
    </>
  );
}
