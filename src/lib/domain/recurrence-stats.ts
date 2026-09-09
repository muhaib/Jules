import 'server-only';

import { prisma } from '@/lib/db';

/**
 * Total occurrences per recurrence key, resolved at read time.
 *
 * A finding's stored `recurrenceCount` is its position in the series at the
 * moment it was raised, so every occurrence except the newest under-reports the
 * total. Any view that says "this has happened N times" must count the series
 * as it stands now, which one grouped query does for a whole page of rows.
 */
export async function seriesTotals(
  organizationId: string,
  keys: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const rows = await prisma.finding.groupBy({
    by: ['recurrenceKey'],
    where: { organizationId, recurrenceKey: { in: unique } },
    _count: true,
  });

  return new Map(rows.map((r) => [r.recurrenceKey, r._count]));
}
