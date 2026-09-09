import type { Metadata } from 'next';
import Link from 'next/link';

import { prisma } from '@/lib/db';
import { branchScope, findingScope, inspectionScope, requirePage } from '@/lib/auth/guard';
import { orgConfig } from '@/lib/domain/settings';
import { fmtDate } from '@/lib/format';
import { str, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, PageHeader, TableWrap } from '@/components/ui/shell';
import { FindingStatusBadge, InspectionStatusBadge, ScoreBadge, SeverityBadge } from '@/components/ui/badges';

export const metadata: Metadata = { title: 'Search' };
export const dynamic = 'force-dynamic';

/**
 * Global search across the records people actually look for by name: branches,
 * finding numbers, checklist items, observations and responsible people.
 * Every query is scoped, so results never leak outside the caller's access.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage();
  const params = await searchParams;
  const q = str(params, 'q')?.trim();

  if (!q) {
    return (
      <>
        <PageHeader title="Search" description="Find a branch, finding, checklist item or person." />
        <Card>
          <EmptyState
            title="Type a search term"
            description="Search by branch name or code, finding number, checklist item, observation text, or the name of a responsible person."
          />
        </Card>
      </>
    );
  }

  const cfg = await orgConfig(user.organizationId);
  const like = { contains: q, mode: 'insensitive' as const };

  const [bScope, fScope, iScope] = await Promise.all([
    branchScope(user),
    findingScope(user),
    inspectionScope(user),
  ]);

  const [branches, findings, inspections, people] = await Promise.all([
    prisma.branch.findMany({
      where: { ...bScope, OR: [{ name: like }, { code: like }, { city: like }, { address: like }] },
      take: 10,
      orderBy: { name: 'asc' },
      include: { region: { select: { name: true } } },
    }),
    prisma.finding.findMany({
      where: {
        ...fScope,
        OR: [
          { number: like },
          { itemText: like },
          { observation: like },
          { categoryName: like },
          { assignedTo: { name: like } },
        ],
      },
      take: 25,
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      include: {
        branch: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.inspection.findMany({
      where: {
        ...iScope,
        OR: [{ reference: like }, { branch: { name: like } }, { inspector: { name: like } }],
      },
      take: 10,
      orderBy: { scheduledFor: 'desc' },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        inspector: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, isActive: true, OR: [{ name: like }, { email: like }] },
      take: 8,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, jobTitle: true },
    }),
  ]);

  const totalResults = branches.length + findings.length + inspections.length + people.length;

  return (
    <>
      <PageHeader
        title={`Search results for “${q}”`}
        description={`${totalResults} result${totalResults === 1 ? '' : 's'} within your access scope.`}
      />

      {totalResults === 0 && (
        <Card>
          <EmptyState
            title="No matches"
            description="Try a branch code, a finding number such as BR-2026-00451, or part of a checklist item."
          />
        </Card>
      )}

      {findings.length > 0 && (
        <Card className="mb-4" title={`Findings (${findings.length})`} bodyClassName="">
          <TableWrap minWidth={820}>
            <thead>
              <tr>
                <th className="th">Finding</th>
                <th className="th">Branch</th>
                <th className="th">Category / Item</th>
                <th className="th">Severity</th>
                <th className="th">Status</th>
                <th className="th">Owner</th>
                <th className="th">Due</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id} className="row-link">
                  <td className="td">
                    <Link href={`/findings/${f.id}`} className="font-mono text-xs text-accent hover:underline">
                      {f.number}
                    </Link>
                  </td>
                  <td className="td">{f.branch.name}</td>
                  <td className="td max-w-[22rem]">
                    <div className="text-2xs uppercase tracking-wide text-faint">{f.categoryName}</div>
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
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {branches.length > 0 && (
        <Card className="mb-4" title={`Branches (${branches.length})`} bodyClassName="">
          <TableWrap minWidth={520}>
            <thead>
              <tr>
                <th className="th">Branch</th>
                <th className="th">Code</th>
                <th className="th">Region</th>
                <th className="th">City</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} className="row-link">
                  <td className="td">
                    <Link href={`/branches/${b.id}`} className="font-medium hover:text-accent hover:underline">
                      {b.name}
                    </Link>
                  </td>
                  <td className="td font-mono text-xs text-muted">{b.code}</td>
                  <td className="td text-muted">{b.region.name}</td>
                  <td className="td text-muted">{b.city}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {inspections.length > 0 && (
        <Card className="mb-4" title={`Inspections (${inspections.length})`} bodyClassName="">
          <TableWrap minWidth={640}>
            <thead>
              <tr>
                <th className="th">Reference</th>
                <th className="th">Branch</th>
                <th className="th">Inspector</th>
                <th className="th">Date</th>
                <th className="th">Status</th>
                <th className="th text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((i) => (
                <tr key={i.id} className="row-link">
                  <td className="td">
                    <Link href={`/inspections/${i.id}`} className="font-mono text-xs text-accent hover:underline">
                      {i.reference}
                    </Link>
                  </td>
                  <td className="td">{i.branch.name}</td>
                  <td className="td text-muted">{i.inspector.name}</td>
                  <td className="td whitespace-nowrap text-muted">
                    {fmtDate(i.submittedAt ?? i.scheduledFor)}
                  </td>
                  <td className="td">
                    <InspectionStatusBadge status={i.status} />
                  </td>
                  <td className="td text-right">
                    <ScoreBadge score={i.score} bands={cfg} />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      )}

      {people.length > 0 && (
        <Card title={`People (${people.length})`} bodyClassName="">
          <ul className="divide-y divide-line">
            {people.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 px-4 py-3 sm:px-5">
                <span className="text-sm font-medium text-ink">{p.name}</span>
                <span className="text-xs text-muted">{p.jobTitle ?? p.role}</span>
                <span className="ml-auto text-xs text-faint">{p.email}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
