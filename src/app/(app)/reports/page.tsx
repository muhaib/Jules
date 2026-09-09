import type { Metadata } from 'next';
import Link from 'next/link';

import { requirePage } from '@/lib/auth/guard';
import { monthlyNarrative, monthlyReport } from '@/lib/monthly-report';
import { fmtNum, fmtPct } from '@/lib/format';
import { num, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, PageHeader, Stat, TableWrap } from '@/components/ui/shell';
import { ScoreBadge } from '@/components/ui/badges';
import { CategoryScoreChart, SeverityChart } from '@/components/charts/dashboard-charts';
import { MonthPicker } from '@/components/month-picker';

export const metadata: Metadata = { title: 'Management report' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage('analytics:view');
  const params = await searchParams;

  const now = new Date();
  const year = num(params, 'year', now.getUTCFullYear());
  const month = num(params, 'month', now.getUTCMonth() + 1);

  const report = await monthlyReport(user, year, month);
  const narrative = monthlyNarrative(report);
  const t = report.totals;

  return (
    <>
      <PageHeader
        title={`${report.period.label} Facility Compliance Report`}
        description={`${user.organizationName} — automated management report.`}
        actions={
          <>
            <MonthPicker year={year} month={month} />
            <Link href="/api/v1/exports/findings.xlsx" prefetch={false} className="btn-secondary">
              Findings Excel
            </Link>
            <Link href="/api/v1/exports/branches.xlsx" prefetch={false} className="btn-secondary">
              Branch Excel
            </Link>
          </>
        }
      />

      <Card title="Management summary">
        <p className="text-sm leading-relaxed text-ink">{narrative}</p>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Branches inspected"
          value={fmtNum(t.branchesInspected)}
          hint={`of ${fmtNum(t.branchesInScope)} in scope · ${fmtPct(t.coverage)} coverage`}
        />
        <Stat
          label="Inspections completed"
          value={fmtNum(t.inspections)}
          hint={`${fmtNum(t.prevInspections)} the previous month`}
        />
        <Stat
          label="Average compliance"
          value={t.averageScore === null ? '—' : fmtPct(t.averageScore, 1)}
          hint={
            t.scoreDelta === null
              ? 'No comparison available'
              : `${t.scoreDelta >= 0 ? '+' : ''}${t.scoreDelta.toFixed(1)} vs previous month`
          }
          tone={t.scoreDelta === null ? 'neutral' : t.scoreDelta >= 0 ? 'ok' : 'bad'}
        />
        <Stat
          label="Findings raised"
          value={fmtNum(t.raised)}
          hint={`${fmtNum(t.closedInMonth)} closed this month`}
          tone={t.raised > t.closedInMonth ? 'warn' : 'ok'}
        />
        <Stat
          label="Critical findings"
          value={fmtNum(report.severity.CRITICAL)}
          hint={`raised in ${report.period.label}`}
          tone={report.severity.CRITICAL > 0 ? 'crit' : 'ok'}
        />
        <Stat label="High findings" value={fmtNum(report.severity.HIGH)} hint={`raised in ${report.period.label}`} />
        <Stat
          label="Overdue now"
          value={fmtNum(t.overdueNow)}
          hint="Current position, not month-end"
          tone={t.overdueNow > 0 ? 'bad' : 'ok'}
        />
        <Stat
          label="Recurring issues"
          value={fmtNum(t.recurringSeries)}
          hint="Same item, same branch, repeated"
          tone={t.recurringSeries > 0 ? 'crit' : 'ok'}
          href="/recurring"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Findings raised by severity" description={report.period.label}>
          <SeverityChart
            data={(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((s) => ({
              severity: s,
              count: report.severity[s],
            }))}
          />
        </Card>
        <Card title="Category performance" description="Average score across inspections this month">
          {report.categories.length > 0 ? (
            <CategoryScoreChart
              data={report.categories.map((c) => ({ category: c.category, score: c.score }))}
            />
          ) : (
            <EmptyState title="No inspections in this period" />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Top-performing branches" description="Highest score in this period" bodyClassName="">
          <BranchTable rows={report.top} bands={report.config} empty="No inspections in this period" />
        </Card>
        <Card title="Lowest-performing branches" description="Where management attention is needed" bodyClassName="">
          <BranchTable rows={report.bottom} bands={report.config} empty="No inspections in this period" />
        </Card>
      </div>

      <Card className="mt-4" title="Reporting notes">
        <ul className="space-y-1.5 text-sm text-muted">
          <li>
            Scores are averaged across inspections submitted between{' '}
            {report.period.start.toISOString().slice(0, 10)} and{' '}
            {report.period.end.toISOString().slice(0, 10)}.
          </li>
          <li>
            &ldquo;Overdue now&rdquo;, &ldquo;open&rdquo; and &ldquo;recurring&rdquo; describe the position today, not
            at month end — they are the numbers a manager needs to act on.
          </li>
          <li>
            Only branches within your access scope are included. A regional manager&rsquo;s report covers
            their regions; a super admin&rsquo;s covers the whole organization.
          </li>
        </ul>
      </Card>
    </>
  );
}

function BranchTable({
  rows,
  bands,
  empty,
}: {
  rows: { branchId: string; name: string; code: string; latestScore: number | null; openFindings: number; overdueFindings: number }[];
  bands: { bandExcellent: number; bandGood: number; bandNeedsWork: number };
  empty: string;
}) {
  if (rows.length === 0) return <EmptyState title={empty} />;
  return (
    <TableWrap minWidth={380}>
      <thead>
        <tr>
          <th className="th">Branch</th>
          <th className="th text-right">Score</th>
          <th className="th text-right">Open</th>
          <th className="th text-right">Overdue</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.branchId} className="row-link">
            <td className="td">
              <Link href={`/branches/${b.branchId}`} className="font-medium hover:text-accent hover:underline">
                {b.name}
              </Link>
              <div className="text-2xs text-muted">{b.code}</div>
            </td>
            <td className="td text-right">
              <ScoreBadge score={b.latestScore} bands={bands} />
            </td>
            <td className="td text-right tabular-nums">{b.openFindings}</td>
            <td className="td text-right tabular-nums">
              {b.overdueFindings > 0 ? <span className="font-medium text-bad">{b.overdueFindings}</span> : 0}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
