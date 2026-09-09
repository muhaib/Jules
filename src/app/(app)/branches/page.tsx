import type { Metadata } from 'next';
import Link from 'next/link';

import { prisma } from '@/lib/db';
import { branchScope, can, requirePage } from '@/lib/auth/guard';
import { branchPerformance, filterOptions } from '@/lib/analytics';
import { orgConfig } from '@/lib/domain/settings';
import { fmtPct } from '@/lib/format';
import { str, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, PageHeader, TableWrap } from '@/components/ui/shell';
import { Badge, ScoreBadge } from '@/components/ui/badges';
import { FilterBar } from '@/components/filter-bar';

export const metadata: Metadata = { title: 'Branches' };
export const dynamic = 'force-dynamic';

export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage('branch:view');
  const params = await searchParams;
  const cfg = await orgConfig(user.organizationId);

  const regionId = str(params, 'regionId');
  const status = str(params, 'status');
  const q = str(params, 'q');

  const scope = await branchScope(user);
  const branches = await prisma.branch.findMany({
    where: {
      ...scope,
      ...(regionId ? { regionId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
              { city: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    include: {
      region: { select: { name: true } },
      cluster: { select: { name: true } },
      manager: { select: { name: true } },
    },
  });

  const [perf, options] = await Promise.all([
    branchPerformance(user, branches.map((b) => b.id)),
    filterOptions(user),
  ]);
  const perfById = new Map(perf.map((p) => [p.branchId, p]));

  return (
    <>
      <PageHeader
        title="Branches"
        description="Every site, its latest compliance score and its open corrective-action workload."
        actions={
          can(user, 'branch:create') ? (
            <Link href="/branches/new" className="btn-primary">
              Add branch
            </Link>
          ) : null
        }
      />

      <FilterBar
        showDateRange={false}
        filters={[
          {
            name: 'regionId',
            label: 'Region',
            options: options.regions.map((r) => ({ value: r.id, label: r.name })),
          },
          {
            name: 'status',
            label: 'Status',
            options: [
              { value: 'ACTIVE', label: 'Active' },
              { value: 'INACTIVE', label: 'Inactive' },
            ],
          },
        ]}
      />

      <Card bodyClassName="">
        {branches.length === 0 ? (
          <EmptyState title="No branches found" description="Adjust the filters to widen the search." />
        ) : (
          <TableWrap minWidth={960}>
            <thead>
              <tr>
                <th className="th">Branch</th>
                <th className="th">Region / Cluster</th>
                <th className="th">Manager</th>
                <th className="th text-right">Latest score</th>
                <th className="th text-right">Open</th>
                <th className="th text-right">Overdue</th>
                <th className="th text-right">Critical</th>
                <th className="th text-right">Closure rate</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const p = perfById.get(b.id);
                return (
                  <tr key={b.id} className="row-link">
                    <td className="td">
                      <Link href={`/branches/${b.id}`} className="font-medium hover:text-accent hover:underline">
                        {b.name}
                      </Link>
                      <div className="text-2xs text-muted">
                        {b.code} · {b.city}
                      </div>
                    </td>
                    <td className="td text-muted">
                      {b.region.name}
                      {b.cluster && <div className="text-2xs text-faint">{b.cluster.name}</div>}
                    </td>
                    <td className="td text-muted">{b.manager?.name ?? '—'}</td>
                    <td className="td text-right">
                      <ScoreBadge score={p?.latestScore ?? null} bands={cfg} />
                    </td>
                    <td className="td text-right tabular-nums">{p?.openFindings ?? 0}</td>
                    <td className="td text-right tabular-nums">
                      {(p?.overdueFindings ?? 0) > 0 ? (
                        <span className="font-medium text-bad">{p?.overdueFindings}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="td text-right tabular-nums">
                      {(p?.criticalFindings ?? 0) > 0 ? (
                        <span className="font-medium text-crit">{p?.criticalFindings}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="td text-right tabular-nums text-muted">{fmtPct(p?.closureRate ?? null)}</td>
                    <td className="td">
                      <Badge tone={b.status === 'ACTIVE' ? 'ok' : 'neutral'}>
                        {b.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                      </Badge>
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
