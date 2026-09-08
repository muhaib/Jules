import { ok, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { branchPerformance, categoryPerformance, dashboard, monthlyTrend } from '@/lib/analytics';

/** Aggregated dashboard payload, for the web UI and any mobile client. */
export const GET = route(async (req) => {
  const user = await requireApi('analytics:view');
  const url = new URL(req.url);

  const parseDate = (key: string) => {
    const v = url.searchParams.get(key);
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };

  const data = await dashboard(user, {
    regionId: url.searchParams.get('regionId') ?? undefined,
    clusterId: url.searchParams.get('clusterId') ?? undefined,
    branchId: url.searchParams.get('branchId') ?? undefined,
    inspectorId: url.searchParams.get('inspectorId') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    severity: (url.searchParams.get('severity') as never) ?? undefined,
    from: parseDate('from'),
    to: parseDate('to'),
  });

  const [trend, branches, categories] = await Promise.all([
    monthlyTrend(user, data.branchIds, data.range.from, data.range.to),
    branchPerformance(user, data.branchIds),
    categoryPerformance(user, data.branchIds, data.range.from, data.range.to),
  ]);

  return ok({
    data: {
      kpis: data.kpis,
      range: data.range,
      bySeverity: data.bySeverity,
      byCategory: data.byCategory,
      byStatus: data.byStatus,
      trend,
      categories,
      branches,
    },
  });
});
