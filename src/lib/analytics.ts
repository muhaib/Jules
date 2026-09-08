import 'server-only';

import type { Prisma, Severity } from '@prisma/client';

import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { findingScope, inspectionScope, branchScope } from '@/lib/auth/guard';
import { orgConfig } from '@/lib/domain/settings';

export type DashboardFilters = {
  regionId?: string;
  clusterId?: string;
  branchId?: string;
  inspectorId?: string;
  category?: string;
  severity?: Severity;
  status?: 'OPEN' | 'OVERDUE' | 'CLOSED' | 'CRITICAL';
  from?: Date;
  to?: Date;
};

/** Branch constraints shared by every aggregation below. */
async function branchFilter(user: SessionUser, f: DashboardFilters) {
  const scope = await branchScope(user);
  const where: Prisma.BranchWhereInput = { ...scope };
  if (f.regionId) where.regionId = f.regionId;
  if (f.clusterId) where.clusterId = f.clusterId;
  if (f.branchId) where.id = f.branchId;
  const branches = await prisma.branch.findMany({ where, select: { id: true } });
  return branches.map((b) => b.id);
}

export type DashboardData = Awaited<ReturnType<typeof dashboard>>;

export async function dashboard(user: SessionUser, f: DashboardFilters = {}) {
  const cfg = await orgConfig(user.organizationId);
  const now = new Date();
  const branchIds = await branchFilter(user, f);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const from = f.from ?? new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const to = f.to ?? now;

  const inspScope = await inspectionScope(user);
  const findScope = await findingScope(user);

  const inspectionWhere: Prisma.InspectionWhereInput = {
    ...inspScope,
    status: 'SUBMITTED',
    branchId: { in: branchIds },
    ...(f.inspectorId ? { inspectorId: f.inspectorId } : {}),
    submittedAt: { gte: from, lte: to },
  };

  const findingWhere: Prisma.FindingWhereInput = {
    ...findScope,
    branchId: { in: branchIds },
    ...(f.severity ? { severity: f.severity } : {}),
    ...(f.category ? { categoryName: f.category } : {}),
    createdAt: { gte: from, lte: to },
  };

  const openWhere: Prisma.FindingWhereInput = {
    ...findingWhere,
    status: { notIn: ['CLOSED', 'CANCELLED'] },
  };

  const [
    totalBranches,
    inspectionsThisMonth,
    openFindings,
    overdueFindings,
    criticalFindings,
    closedFindings,
    allFindingsInRange,
    scoreAgg,
    severityGroups,
    categoryGroups,
    statusGroups,
    recurringCount,
  ] = await Promise.all([
    prisma.branch.count({ where: { id: { in: branchIds }, status: 'ACTIVE' } }),
    prisma.inspection.count({
      where: { ...inspectionWhere, submittedAt: { gte: monthStart, lte: now } },
    }),
    prisma.finding.count({ where: openWhere }),
    prisma.finding.count({ where: { ...openWhere, dueDate: { lt: now } } }),
    prisma.finding.count({ where: { ...openWhere, severity: 'CRITICAL' } }),
    prisma.finding.count({ where: { ...findingWhere, status: 'CLOSED' } }),
    prisma.finding.count({ where: findingWhere }),
    prisma.inspection.aggregate({ where: inspectionWhere, _avg: { score: true }, _count: true }),
    prisma.finding.groupBy({ by: ['severity'], where: openWhere, _count: true }),
    prisma.finding.groupBy({ by: ['categoryName'], where: findingWhere, _count: true }),
    prisma.finding.groupBy({ by: ['status'], where: findingWhere, _count: true }),
    prisma.finding.count({ where: { ...openWhere, isRecurring: true } }),
  ]);

  // Corrective-action closure rate over the selected window.
  const closureRate = allFindingsInRange > 0 ? (closedFindings / allFindingsInRange) * 100 : null;

  return {
    config: cfg,
    range: { from, to },
    kpis: {
      totalBranches,
      inspectionsThisMonth,
      openFindings,
      overdueFindings,
      criticalFindings,
      averageScore: scoreAgg._avg.score,
      inspectionsInRange: scoreAgg._count,
      closureRate,
      closedFindings,
      totalFindings: allFindingsInRange,
      recurringOpen: recurringCount,
    },
    bySeverity: severityGroups.map((g) => ({ severity: g.severity, count: g._count })),
    byCategory: categoryGroups
      .map((g) => ({ category: g.categoryName, count: g._count }))
      .sort((a, b) => b.count - a.count),
    byStatus: statusGroups.map((g) => ({ status: g.status, count: g._count })),
    branchIds,
    inspectionWhere,
    findingWhere,
    openWhere,
  };
}

/** Inspections and average score per month, for the trend chart. */
export async function monthlyTrend(
  user: SessionUser,
  branchIds: string[],
  from: Date,
  to: Date,
) {
  const rows = await prisma.$queryRaw<
    { month: Date; inspections: bigint; avg_score: number | null }[]
  >`
    SELECT date_trunc('month', "submittedAt") AS month,
           count(*)::bigint                   AS inspections,
           avg(score)                         AS avg_score
    FROM inspections
    WHERE "organizationId" = ${user.organizationId}
      AND status = 'SUBMITTED'
      AND "branchId" = ANY(${branchIds})
      AND "submittedAt" BETWEEN ${from} AND ${to}
    GROUP BY 1
    ORDER BY 1
  `;

  const findings = await prisma.$queryRaw<
    { month: Date; opened: bigint; closed: bigint }[]
  >`
    SELECT date_trunc('month', "createdAt") AS month,
           count(*)::bigint                                              AS opened,
           count(*) FILTER (WHERE status = 'CLOSED')::bigint             AS closed
    FROM findings
    WHERE "organizationId" = ${user.organizationId}
      AND "branchId" = ANY(${branchIds})
      AND "createdAt" BETWEEN ${from} AND ${to}
    GROUP BY 1
    ORDER BY 1
  `;

  const byMonth = new Map<string, { month: string; inspections: number; score: number | null; opened: number; closed: number }>();

  const key = (d: Date) => d.toISOString().slice(0, 7);

  for (const r of rows) {
    byMonth.set(key(r.month), {
      month: key(r.month),
      inspections: Number(r.inspections),
      score: r.avg_score === null ? null : Math.round(Number(r.avg_score) * 10) / 10,
      opened: 0,
      closed: 0,
    });
  }
  for (const r of findings) {
    const k = key(r.month);
    const existing = byMonth.get(k) ?? { month: k, inspections: 0, score: null, opened: 0, closed: 0 };
    existing.opened = Number(r.opened);
    existing.closed = Number(r.closed);
    byMonth.set(k, existing);
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type BranchPerformance = {
  branchId: string;
  name: string;
  code: string;
  city: string;
  regionName: string;
  latestScore: number | null;
  previousScore: number | null;
  inspections: number;
  openFindings: number;
  overdueFindings: number;
  criticalFindings: number;
  closureRate: number | null;
};

/**
 * Per-branch rollup used by the dashboard leaderboards and the branch list.
 * Built with grouped queries rather than per-branch round trips.
 */
export async function branchPerformance(
  user: SessionUser,
  branchIds: string[],
  opts: { from?: Date; to?: Date } = {},
): Promise<BranchPerformance[]> {
  if (branchIds.length === 0) return [];
  const now = new Date();

  const branches = await prisma.branch.findMany({
    where: { id: { in: branchIds } },
    include: { region: { select: { name: true } } },
  });

  const inspections = await prisma.inspection.findMany({
    where: {
      organizationId: user.organizationId,
      branchId: { in: branchIds },
      status: 'SUBMITTED',
      ...(opts.from || opts.to
        ? { submittedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    },
    select: { branchId: true, score: true, submittedAt: true },
    orderBy: { submittedAt: 'desc' },
  });

  const [openGroups, overdueGroups, criticalGroups, totalGroups, closedGroups] = await Promise.all([
    prisma.finding.groupBy({
      by: ['branchId'],
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      _count: true,
    }),
    prisma.finding.groupBy({
      by: ['branchId'],
      where: {
        organizationId: user.organizationId,
        branchId: { in: branchIds },
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        dueDate: { lt: now },
      },
      _count: true,
    }),
    prisma.finding.groupBy({
      by: ['branchId'],
      where: {
        organizationId: user.organizationId,
        branchId: { in: branchIds },
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        severity: 'CRITICAL',
      },
      _count: true,
    }),
    prisma.finding.groupBy({
      by: ['branchId'],
      where: { organizationId: user.organizationId, branchId: { in: branchIds } },
      _count: true,
    }),
    prisma.finding.groupBy({
      by: ['branchId'],
      where: { organizationId: user.organizationId, branchId: { in: branchIds }, status: 'CLOSED' },
      _count: true,
    }),
  ]);

  const countMap = (rows: { branchId: string; _count: number }[]) =>
    new Map(rows.map((r) => [r.branchId, r._count]));

  const open = countMap(openGroups);
  const overdue = countMap(overdueGroups);
  const critical = countMap(criticalGroups);
  const total = countMap(totalGroups);
  const closed = countMap(closedGroups);

  const scoresByBranch = new Map<string, number[]>();
  for (const i of inspections) {
    if (i.score === null) continue;
    const list = scoresByBranch.get(i.branchId) ?? [];
    list.push(i.score);
    scoresByBranch.set(i.branchId, list);
  }

  return branches.map((b) => {
    const scores = scoresByBranch.get(b.id) ?? [];
    const totalCount = total.get(b.id) ?? 0;
    const closedCount = closed.get(b.id) ?? 0;
    return {
      branchId: b.id,
      name: b.name,
      code: b.code,
      city: b.city,
      regionName: b.region.name,
      latestScore: scores[0] ?? null,
      previousScore: scores[1] ?? null,
      inspections: scores.length,
      openFindings: open.get(b.id) ?? 0,
      overdueFindings: overdue.get(b.id) ?? 0,
      criticalFindings: critical.get(b.id) ?? 0,
      closureRate: totalCount > 0 ? (closedCount / totalCount) * 100 : null,
    };
  });
}

/** Average score per checklist category across the selected branches. */
export async function categoryPerformance(user: SessionUser, branchIds: string[], from: Date, to: Date) {
  if (branchIds.length === 0) return [];
  const rows = await prisma.$queryRaw<{ category: string; score: number | null; failures: bigint }[]>`
    SELECT r."categoryName" AS category,
           avg(
             CASE r.result
               WHEN 'COMPLIANT' THEN 100.0
               WHEN 'PARTIALLY_COMPLIANT' THEN 50.0
               WHEN 'NON_COMPLIANT' THEN 0.0
             END
           ) AS score,
           count(*) FILTER (WHERE r.result = 'NON_COMPLIANT')::bigint AS failures
    FROM inspection_responses r
    JOIN inspections i ON i.id = r."inspectionId"
    WHERE i."organizationId" = ${user.organizationId}
      AND i.status = 'SUBMITTED'
      AND i."branchId" = ANY(${branchIds})
      AND i."submittedAt" BETWEEN ${from} AND ${to}
      AND r.result IS NOT NULL
      AND r.result <> 'NOT_APPLICABLE'
    GROUP BY 1
    ORDER BY 2 ASC
  `;

  return rows.map((r) => ({
    category: r.category,
    score: r.score === null ? null : Math.round(Number(r.score) * 10) / 10,
    failures: Number(r.failures),
  }));
}

/** Repeat offenders: same item failing repeatedly at the same branch. */
export async function recurringFindings(user: SessionUser, branchIds: string[], limit = 20) {
  if (branchIds.length === 0) return [];

  const rows = await prisma.finding.groupBy({
    by: ['recurrenceKey', 'branchId', 'itemText', 'categoryName'],
    where: { organizationId: user.organizationId, branchId: { in: branchIds }, isRecurring: true },
    _count: true,
    _max: { createdAt: true },
    orderBy: { _count: { recurrenceKey: 'desc' } },
    take: limit,
  });

  const branches = await prisma.branch.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.branchId))] } },
    select: { id: true, name: true, code: true },
  });
  const byId = new Map(branches.map((b) => [b.id, b]));

  const detail = await prisma.finding.findMany({
    where: { recurrenceKey: { in: rows.map((r) => r.recurrenceKey) }, organizationId: user.organizationId },
    select: { recurrenceKey: true, createdAt: true, status: true, id: true, number: true },
    orderBy: { createdAt: 'asc' },
  });

  const occurrencesByKey = new Map<string, typeof detail>();
  for (const d of detail) {
    const list = occurrencesByKey.get(d.recurrenceKey) ?? [];
    list.push(d);
    occurrencesByKey.set(d.recurrenceKey, list);
  }

  return rows.map((r) => ({
    key: r.recurrenceKey,
    branch: byId.get(r.branchId) ?? { id: r.branchId, name: 'Unknown', code: '' },
    itemText: r.itemText,
    categoryName: r.categoryName,
    count: r._count,
    lastSeen: r._max.createdAt,
    occurrences: occurrencesByKey.get(r.recurrenceKey) ?? [],
  }));
}

/** Filter option lists, already scoped to what the caller may see. */
export async function filterOptions(user: SessionUser) {
  const scope = await branchScope(user);
  const [branches, regions, clusters, inspectors, categories] = await Promise.all([
    prisma.branch.findMany({ where: scope, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
    prisma.region.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.cluster.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true, regionId: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, role: 'INSPECTOR', isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.inspectionCategory.findMany({
      where: { template: { organizationId: user.organizationId } },
      select: { name: true },
      distinct: ['name'],
      orderBy: { name: 'asc' },
    }),
  ]);

  return {
    branches,
    regions,
    clusters,
    inspectors,
    categories: categories.map((c) => c.name),
  };
}
