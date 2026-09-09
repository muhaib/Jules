import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound as nextNotFound } from 'next/navigation';

import { prisma } from '@/lib/db';
import { can, loadBranchOr404, requirePage } from '@/lib/auth/guard';
import { orgConfig } from '@/lib/domain/settings';
import { deadlineState, describeRemaining } from '@/lib/domain/deadlines';
import { bandFor, BAND_LABELS } from '@/lib/domain/scoring';
import { fmtDate, fmtMonth, fmtPct } from '@/lib/format';
import { Card, EmptyState, Field, PageHeader, Stat, TableWrap } from '@/components/ui/shell';
import {
  Badge,
  DeadlineBadge,
  FindingStatusBadge,
  RecurringBadge,
  ScoreBadge,
  SeverityBadge,
} from '@/components/ui/badges';
import { BranchHistoryChart } from '@/components/charts/branch-charts';
import { CategoryScoreChart } from '@/components/charts/dashboard-charts';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const branch = await prisma.branch.findUnique({ where: { id }, select: { name: true } });
  return { title: branch?.name ?? 'Branch' };
}

export default async function BranchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage('branch:view');
  const { id } = await params;
  const cfg = await orgConfig(user.organizationId);

  await loadBranchOr404(user, id);

  const branch = await prisma.branch.findUnique({
    where: { id },
    include: {
      region: { select: { name: true } },
      cluster: { select: { name: true } },
      manager: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
  if (!branch) nextNotFound();

  const now = new Date();

  const [inspections, findings, openCount, overdueCount, criticalCount, closedCount, totalFindings] =
    await Promise.all([
      prisma.inspection.findMany({
        where: { branchId: id, status: 'SUBMITTED' },
        orderBy: { submittedAt: 'desc' },
        include: {
          inspector: { select: { name: true } },
          template: { select: { name: true } },
          _count: { select: { findings: true } },
        },
      }),
      prisma.finding.findMany({
        where: { branchId: id, status: { notIn: ['CLOSED', 'CANCELLED'] } },
        orderBy: [{ severity: 'asc' }, { dueDate: 'asc' }],
        take: 25,
        include: { assignedTo: { select: { name: true } } },
      }),
      prisma.finding.count({ where: { branchId: id, status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
      prisma.finding.count({
        where: { branchId: id, status: { notIn: ['CLOSED', 'CANCELLED'] }, dueDate: { lt: now } },
      }),
      prisma.finding.count({
        where: { branchId: id, status: { notIn: ['CLOSED', 'CANCELLED'] }, severity: 'CRITICAL' },
      }),
      prisma.finding.count({ where: { branchId: id, status: 'CLOSED' } }),
      prisma.finding.count({ where: { branchId: id } }),
    ]);

  const criticalPerInspection = await prisma.finding.groupBy({
    by: ['inspectionId'],
    where: { branchId: id, severity: 'CRITICAL', inspectionId: { not: null } },
    _count: true,
  });
  const criticalByInspection = new Map(
    criticalPerInspection.map((c) => [c.inspectionId as string, c._count]),
  );

  const latest = inspections[0];
  const closureRate = totalFindings > 0 ? (closedCount / totalFindings) * 100 : null;
  const band = bandFor(latest?.score ?? null, cfg);

  const history = [...inspections]
    .reverse()
    .map((i) => ({
      label: i.submittedAt ? fmtMonth(i.submittedAt) : '—',
      score: i.score,
      findings: i._count.findings,
      critical: criticalByInspection.get(i.id) ?? 0,
    }));

  const latestCategories =
    (latest?.categoryScores as { name: string; score: number | null }[] | null) ?? [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Branches', href: '/branches' }, { label: branch.name }]}
        title={branch.name}
        description={`${branch.code} · ${branch.branchType} · ${branch.city}`}
        actions={
          <>
            <Badge tone={branch.status === 'ACTIVE' ? 'ok' : 'neutral'}>
              {branch.status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </Badge>
            {can(user, 'inspection:assign') && (
              <Link href={`/inspections/new?branchId=${branch.id}`} className="btn-primary">
                Assign inspection
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="card card-pad col-span-2 lg:col-span-1">
          <div className="kicker">Latest score</div>
          <div className="mt-1">
            <ScoreBadge score={latest?.score ?? null} bands={cfg} size="lg" />
          </div>
          <div className="mt-1 text-2xs text-muted">
            {latest?.submittedAt ? fmtDate(latest.submittedAt) : 'Never inspected'}
          </div>
        </div>
        <Stat label="Open findings" value={openCount} tone={openCount > 0 ? 'warn' : 'ok'} />
        <Stat label="Overdue" value={overdueCount} tone={overdueCount > 0 ? 'bad' : 'ok'} />
        <Stat label="Critical" value={criticalCount} tone={criticalCount > 0 ? 'crit' : 'ok'} />
        <Stat
          label="Corrective actions closed"
          value={fmtPct(closureRate)}
          hint={`${closedCount} of ${totalFindings}`}
          tone={(closureRate ?? 0) >= 75 ? 'ok' : 'warn'}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Inspection history"
          description="Score trend against findings raised — is the branch actually improving?"
        >
          {history.length > 0 ? (
            <BranchHistoryChart data={history} />
          ) : (
            <EmptyState title="No inspection history yet" />
          )}
        </Card>

        <Card title="Branch profile">
          <dl className="divide-y divide-line">
            <Field label="Branch code">
              <span className="font-mono">{branch.code}</span>
            </Field>
            <Field label="Region / Cluster">
              {branch.region.name}
              {branch.cluster && <span className="block text-2xs text-muted">{branch.cluster.name}</span>}
            </Field>
            <Field label="Address">{branch.address}</Field>
            <Field label="Branch manager">
              {branch.manager ? (
                <>
                  {branch.manager.name}
                  <span className="block text-2xs text-muted">{branch.manager.email}</span>
                </>
              ) : (
                <span className="text-warn">Not assigned</span>
              )}
            </Field>
            <Field label="Contact">{branch.contactNumber ?? '—'}</Field>
            <Field label="Opening date">{fmtDate(branch.openingDate)}</Field>
            <Field label="Grade band">
              {band ? BAND_LABELS[band] : <span className="text-faint">—</span>}
            </Field>
          </dl>
        </Card>
      </div>

      {latestCategories.length > 0 && (
        <Card
          className="mt-4"
          title="Category scores — latest inspection"
          description="Where this branch is weak, by checklist category"
        >
          <CategoryScoreChart
            data={latestCategories.map((c) => ({ category: c.name, score: c.score }))}
          />
        </Card>
      )}

      <Card className="mt-4" title="Open findings" description="Sorted by severity then deadline" bodyClassName="">
        {findings.length === 0 ? (
          <EmptyState title="No open findings" description="Every corrective action at this branch is closed." />
        ) : (
          <TableWrap minWidth={880}>
            <thead>
              <tr>
                <th className="th">Finding</th>
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
                    <Link href={`/findings/${f.id}`} className="font-mono text-xs text-accent hover:underline">
                      {f.number}
                    </Link>
                    {f.isRecurring && (
                      <div className="mt-1">
                        <RecurringBadge count={f.recurrenceCount} />
                      </div>
                    )}
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
        )}
      </Card>

      <Card className="mt-4" title="Inspection record" bodyClassName="">
        {inspections.length === 0 ? (
          <EmptyState title="No inspections recorded" />
        ) : (
          <TableWrap minWidth={760}>
            <thead>
              <tr>
                <th className="th">Reference</th>
                <th className="th">Date</th>
                <th className="th">Template</th>
                <th className="th">Inspector</th>
                <th className="th text-right">Score</th>
                <th className="th text-right">Findings</th>
                <th className="th text-right">Critical</th>
                <th className="th">Report</th>
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
                  <td className="td whitespace-nowrap text-muted">{fmtDate(i.submittedAt)}</td>
                  <td className="td text-muted">{i.template.name}</td>
                  <td className="td text-muted">{i.inspector.name}</td>
                  <td className="td text-right">
                    <ScoreBadge score={i.score} bands={cfg} />
                  </td>
                  <td className="td text-right tabular-nums">{i._count.findings}</td>
                  <td className="td text-right tabular-nums">
                    {criticalByInspection.get(i.id) ?? 0}
                  </td>
                  <td className="td">
                    <Link
                      href={`/api/v1/inspections/${i.id}/report.pdf`}
                      prefetch={false}
                      className="text-xs text-accent hover:underline"
                    >
                      PDF
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
