import 'server-only';

import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { branchScope } from '@/lib/auth/guard';
import { branchPerformance, categoryPerformance } from '@/lib/analytics';
import { orgConfig } from '@/lib/domain/settings';

export type MonthlyReport = Awaited<ReturnType<typeof monthlyReport>>;

/**
 * The automated management report for a single month.
 *
 * Everything here is measured against the month's boundaries rather than "now",
 * so a report for a past month does not silently change as time passes — except
 * open/overdue counts, which are explicitly labelled as a current position.
 */
export async function monthlyReport(user: SessionUser, year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1) - 1);
  const prevStart = new Date(Date.UTC(year, month - 2, 1));
  const prevEnd = new Date(Date.UTC(year, month - 1, 1) - 1);
  const now = new Date();

  const cfg = await orgConfig(user.organizationId);
  const scope = await branchScope(user);
  const branches = await prisma.branch.findMany({ where: scope, select: { id: true } });
  const branchIds = branches.map((b) => b.id);

  const inRange = { gte: start, lte: end };

  const [
    inspections,
    prevInspections,
    scoreAgg,
    prevScoreAgg,
    raised,
    closedInMonth,
    severityGroups,
    openNow,
    overdueNow,
    criticalOpenNow,
    recurringNow,
    branchesInspected,
  ] = await Promise.all([
    prisma.inspection.count({
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, status: 'SUBMITTED', submittedAt: inRange },
    }),
    prisma.inspection.count({
      where: {
        organizationId: user.organizationId,
        branchId: { in: branchIds },
        status: 'SUBMITTED',
        submittedAt: { gte: prevStart, lte: prevEnd },
      },
    }),
    prisma.inspection.aggregate({
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, status: 'SUBMITTED', submittedAt: inRange },
      _avg: { score: true },
    }),
    prisma.inspection.aggregate({
      where: {
        organizationId: user.organizationId,
        branchId: { in: branchIds },
        status: 'SUBMITTED',
        submittedAt: { gte: prevStart, lte: prevEnd },
      },
      _avg: { score: true },
    }),
    prisma.finding.count({
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, createdAt: inRange },
    }),
    prisma.finding.count({
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, closedAt: inRange },
    }),
    prisma.finding.groupBy({
      by: ['severity'],
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, createdAt: inRange },
      _count: true,
    }),
    prisma.finding.count({
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    }),
    prisma.finding.count({
      where: {
        organizationId: user.organizationId,
        branchId: { in: branchIds },
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        dueDate: { lt: now },
      },
    }),
    prisma.finding.count({
      where: {
        organizationId: user.organizationId,
        branchId: { in: branchIds },
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        severity: 'CRITICAL',
      },
    }),
    prisma.finding.groupBy({
      by: ['recurrenceKey'],
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, isRecurring: true },
      _count: true,
    }),
    prisma.inspection.findMany({
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, status: 'SUBMITTED', submittedAt: inRange },
      select: { branchId: true },
      distinct: ['branchId'],
    }),
  ]);

  const [perf, categories] = await Promise.all([
    branchPerformance(user, branchIds, { from: start, to: end }),
    categoryPerformance(user, branchIds, start, end),
  ]);

  const ranked = perf
    .filter((p) => p.latestScore !== null)
    .sort((a, b) => (b.latestScore ?? 0) - (a.latestScore ?? 0));

  const severity = Object.fromEntries(
    ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => [
      s,
      severityGroups.find((g) => g.severity === s)?._count ?? 0,
    ]),
  ) as Record<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW', number>;

  const avg = scoreAgg._avg.score;
  const prevAvg = prevScoreAgg._avg.score;

  return {
    period: { year, month, start, end, label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) },
    config: cfg,
    totals: {
      branchesInScope: branchIds.length,
      branchesInspected: branchesInspected.length,
      inspections,
      prevInspections,
      averageScore: avg,
      prevAverageScore: prevAvg,
      scoreDelta: avg !== null && prevAvg !== null ? Math.round((avg - prevAvg) * 10) / 10 : null,
      raised,
      closedInMonth,
      openNow,
      overdueNow,
      criticalOpenNow,
      recurringSeries: recurringNow.length,
      coverage: branchIds.length > 0 ? (branchesInspected.length / branchIds.length) * 100 : null,
    },
    severity,
    categories,
    top: ranked.slice(0, 5),
    bottom: [...ranked].reverse().slice(0, 5),
  };
}

/** Narrative summary written from the month's actual numbers. */
export function monthlyNarrative(report: MonthlyReport) {
  const t = report.totals;
  const parts: string[] = [];

  parts.push(
    `${t.inspections} inspection${t.inspections === 1 ? '' : 's'} ${t.inspections === 1 ? 'was' : 'were'} completed across ${t.branchesInspected} of ${t.branchesInScope} branches in ${report.period.label}` +
      (t.coverage !== null ? `, giving ${t.coverage.toFixed(0)}% coverage.` : '.'),
  );

  if (t.averageScore !== null) {
    const direction =
      t.scoreDelta === null
        ? ''
        : t.scoreDelta > 0
          ? ` — up ${t.scoreDelta.toFixed(1)} points on the previous month`
          : t.scoreDelta < 0
            ? ` — down ${Math.abs(t.scoreDelta).toFixed(1)} points on the previous month`
            : ' — unchanged on the previous month';
    parts.push(`Average compliance was ${t.averageScore.toFixed(1)}%${direction}.`);
  }

  parts.push(
    `${t.raised} finding${t.raised === 1 ? '' : 's'} ${t.raised === 1 ? 'was' : 'were'} raised and ${t.closedInMonth} ${t.closedInMonth === 1 ? 'was' : 'were'} closed with verified evidence.`,
  );

  if (t.raised > t.closedInMonth && t.raised > 0) {
    parts.push(
      `Findings are being raised faster than they are being closed, so the open backlog grew this month.`,
    );
  } else if (t.closedInMonth > t.raised) {
    parts.push('Closures outpaced new findings, reducing the open backlog.');
  }

  if (t.overdueNow > 0) {
    parts.push(
      `${t.overdueNow} finding${t.overdueNow === 1 ? '' : 's'} ${t.overdueNow === 1 ? 'is' : 'are'} currently past the remediation deadline` +
        (t.criticalOpenNow > 0 ? `, and ${t.criticalOpenNow} critical finding${t.criticalOpenNow === 1 ? '' : 's'} remain open.` : '.'),
    );
  } else {
    parts.push('No findings are currently overdue.');
  }

  if (t.recurringSeries > 0) {
    parts.push(
      `${t.recurringSeries} issue${t.recurringSeries === 1 ? '' : 's'} ${t.recurringSeries === 1 ? 'has' : 'have'} now recurred at the same branch and should be treated as a systemic problem rather than a one-time defect.`,
    );
  }

  const weakest = report.categories.filter((c) => c.score !== null)[0];
  if (weakest) {
    parts.push(`The weakest category this month was ${weakest.category} at ${weakest.score}%.`);
  }

  return parts.join(' ');
}
