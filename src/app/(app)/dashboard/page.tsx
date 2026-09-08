import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { requirePage } from '@/lib/auth/guard';
import {
  branchPerformance,
  categoryPerformance,
  dashboard,
  filterOptions,
  monthlyTrend,
} from '@/lib/analytics';
import { fmtNum, fmtPct } from '@/lib/format';
import { date, endOfDay, severity, str, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, PageHeader, Stat, TableWrap } from '@/components/ui/shell';
import { ScoreBadge } from '@/components/ui/badges';
import { FilterBar } from '@/components/filter-bar';
import {
  BranchScoreChart,
  CategoryChart,
  CategoryScoreChart,
  OpenVsClosedChart,
  ScoreTrendChart,
  SeverityChart,
  StatusChart,
  TrendChart,
} from '@/components/charts/dashboard-charts';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage();
  const params = await searchParams;

  const filters = {
    regionId: str(params, 'regionId'),
    clusterId: str(params, 'clusterId'),
    branchId: str(params, 'branchId'),
    inspectorId: str(params, 'inspectorId'),
    category: str(params, 'category'),
    severity: severity(params),
    from: date(params, 'from'),
    to: endOfDay(date(params, 'to')),
  };

  const [data, options] = await Promise.all([dashboard(user, filters), filterOptions(user)]);

  const [trend, branches, categories] = await Promise.all([
    monthlyTrend(user, data.branchIds, data.range.from, data.range.to),
    branchPerformance(user, data.branchIds),
    categoryPerformance(user, data.branchIds, data.range.from, data.range.to),
  ]);

  const ranked = branches
    .filter((b) => b.latestScore !== null)
    .sort((a, b) => (b.latestScore ?? 0) - (a.latestScore ?? 0));
  const top = ranked.slice(0, 6);
  const bottom = [...ranked].reverse().slice(0, 6);

  const { kpis, config } = data;

  return (
    <>
      <PageHeader
        title="Compliance Dashboard"
        description={`${user.organizationName} — facility compliance and corrective action status.`}
        actions={
          <Link href="/reports" className="btn-secondary">
            Monthly report
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      />

      <FilterBar
        filters={[
          { name: 'regionId', label: 'Region', options: options.regions.map((r) => ({ value: r.id, label: r.name })) },
          { name: 'clusterId', label: 'Cluster', options: options.clusters.map((c) => ({ value: c.id, label: c.name })) },
          { name: 'branchId', label: 'Branch', options: options.branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })) },
          { name: 'inspectorId', label: 'Inspector', options: options.inspectors.map((i) => ({ value: i.id, label: i.name })) },
          { name: 'category', label: 'Category', options: options.categories.map((c) => ({ value: c, label: c })) },
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
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Branches" value={fmtNum(kpis.totalBranches)} hint="Active sites in scope" href="/branches" />
        <Stat
          label="Inspections This Month"
          value={fmtNum(kpis.inspectionsThisMonth)}
          hint={`${fmtNum(kpis.inspectionsInRange)} in selected range`}
          href="/inspections"
        />
        <Stat
          label="Open Findings"
          value={fmtNum(kpis.openFindings)}
          hint={`${fmtNum(kpis.recurringOpen)} recurring`}
          tone={kpis.openFindings > 0 ? 'warn' : 'ok'}
          href="/findings?status=open"
        />
        <Stat
          label="Overdue Findings"
          value={fmtNum(kpis.overdueFindings)}
          hint="Past their remediation deadline"
          tone={kpis.overdueFindings > 0 ? 'bad' : 'ok'}
          href="/findings?deadline=overdue"
        />
        <Stat
          label="Critical Findings"
          value={fmtNum(kpis.criticalFindings)}
          hint="Open, immediate risk"
          tone={kpis.criticalFindings > 0 ? 'crit' : 'ok'}
          href="/findings?severity=CRITICAL&status=open"
        />
        <Stat
          label="Average Compliance"
          value={kpis.averageScore === null ? '—' : fmtPct(kpis.averageScore, 1)}
          hint={bandLabel(kpis.averageScore, config)}
          tone={scoreTone(kpis.averageScore, config)}
        />
        <Stat
          label="Corrective Actions Closed"
          value={kpis.closureRate === null ? '—' : fmtPct(kpis.closureRate)}
          hint={`${fmtNum(kpis.closedFindings)} of ${fmtNum(kpis.totalFindings)}`}
          tone={(kpis.closureRate ?? 0) >= 75 ? 'ok' : 'warn'}
        />
        <Stat
          label="Recurring Issues"
          value={fmtNum(kpis.recurringOpen)}
          hint="Same item failing repeatedly"
          tone={kpis.recurringOpen > 0 ? 'crit' : 'ok'}
          href="/recurring"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card title="Monthly inspection trend" description="Inspections submitted per month">
          <TrendChart data={trend} />
        </Card>
        <Card title="Average compliance score" description="Rolled up across branches in scope">
          <ScoreTrendChart data={trend} />
        </Card>
        <Card title="Findings raised vs closed" description="Are corrections keeping pace with discovery?">
          <OpenVsClosedChart data={trend} />
        </Card>
        <Card title="Open findings by severity">
          <SeverityChart data={data.bySeverity} />
        </Card>
        <Card title="Findings by category" description="Where the failures concentrate">
          <CategoryChart data={data.byCategory} />
        </Card>
        <Card title="Category performance" description="Average score per checklist category">
          <CategoryScoreChart data={categories} />
        </Card>
        <Card title="Corrective action status" description="Where open findings currently sit">
          <StatusChart data={data.byStatus} />
        </Card>
        <Card title="Overdue by branch" description="Branches carrying the most overdue actions">
          {branches.some((b) => b.overdueFindings > 0) ? (
            <TableWrap minWidth={360}>
              <thead>
                <tr>
                  <th className="th">Branch</th>
                  <th className="th text-right">Overdue</th>
                  <th className="th text-right">Critical</th>
                  <th className="th text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {branches
                  .filter((b) => b.overdueFindings > 0)
                  .sort((a, b) => b.overdueFindings - a.overdueFindings)
                  .slice(0, 8)
                  .map((b) => (
                    <tr key={b.branchId} className="row-link">
                      <td className="td">
                        <Link href={`/branches/${b.branchId}`} className="font-medium hover:text-accent hover:underline">
                          {b.name}
                        </Link>
                        <div className="text-2xs text-muted">{b.code}</div>
                      </td>
                      <td className="td text-right font-medium tabular-nums text-bad">{b.overdueFindings}</td>
                      <td className="td text-right tabular-nums">{b.criticalFindings}</td>
                      <td className="td text-right tabular-nums">{b.openFindings}</td>
                    </tr>
                  ))}
              </tbody>
            </TableWrap>
          ) : (
            <EmptyState title="Nothing overdue" description="Every open finding is still inside its deadline." />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Top-performing branches" description="By latest inspection score">
          <BranchScoreChart data={top.map((b) => ({ name: b.name, score: b.latestScore }))} />
        </Card>
        <Card title="Lowest-performing branches" description="Where management attention is needed">
          <BranchScoreChart data={bottom.map((b) => ({ name: b.name, score: b.latestScore }))} />
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Branch performance"
        description="Latest score, movement since the previous inspection, and open workload"
        bodyClassName=""
        actions={
          <Link href="/branches" className="text-xs text-accent hover:underline">
            All branches
          </Link>
        }
      >
        <TableWrap>
          <thead>
            <tr>
              <th className="th">Branch</th>
              <th className="th">Region</th>
              <th className="th text-right">Latest</th>
              <th className="th text-right">Change</th>
              <th className="th text-right">Open</th>
              <th className="th text-right">Overdue</th>
              <th className="th text-right">Critical</th>
              <th className="th text-right">Closure rate</th>
            </tr>
          </thead>
          <tbody>
            {ranked.slice(0, 12).map((b) => {
              const delta =
                b.latestScore !== null && b.previousScore !== null
                  ? b.latestScore - b.previousScore
                  : null;
              return (
                <tr key={b.branchId} className="row-link">
                  <td className="td">
                    <Link href={`/branches/${b.branchId}`} className="font-medium hover:text-accent hover:underline">
                      {b.name}
                    </Link>
                    <div className="text-2xs text-muted">{b.code}</div>
                  </td>
                  <td className="td text-muted">{b.regionName}</td>
                  <td className="td text-right">
                    <ScoreBadge score={b.latestScore} bands={config} />
                  </td>
                  <td className="td text-right tabular-nums">
                    {delta === null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span className={delta >= 0 ? 'text-ok' : 'text-bad'}>
                        {delta >= 0 ? '+' : ''}
                        {delta.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td className="td text-right tabular-nums">{b.openFindings}</td>
                  <td className="td text-right tabular-nums">
                    {b.overdueFindings > 0 ? (
                      <span className="font-medium text-bad">{b.overdueFindings}</span>
                    ) : (
                      b.overdueFindings
                    )}
                  </td>
                  <td className="td text-right tabular-nums">
                    {b.criticalFindings > 0 ? (
                      <span className="font-medium text-crit">{b.criticalFindings}</span>
                    ) : (
                      b.criticalFindings
                    )}
                  </td>
                  <td className="td text-right tabular-nums text-muted">{fmtPct(b.closureRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      </Card>
    </>
  );
}

function bandLabel(score: number | null, cfg: { bandExcellent: number; bandGood: number; bandNeedsWork: number }) {
  if (score === null) return 'No submitted inspections';
  if (score >= cfg.bandExcellent) return 'Excellent';
  if (score >= cfg.bandGood) return 'Good';
  if (score >= cfg.bandNeedsWork) return 'Needs Improvement';
  return 'Poor';
}

function scoreTone(
  score: number | null,
  cfg: { bandExcellent: number; bandGood: number; bandNeedsWork: number },
): 'ok' | 'accent' | 'warn' | 'bad' | 'neutral' {
  if (score === null) return 'neutral';
  if (score >= cfg.bandExcellent) return 'ok';
  if (score >= cfg.bandGood) return 'accent';
  if (score >= cfg.bandNeedsWork) return 'warn';
  return 'bad';
}
