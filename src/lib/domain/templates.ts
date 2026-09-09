import 'server-only';

import { prisma } from '@/lib/db';
import { notFound } from '@/lib/auth/guard';

/** Template shape returned to the editor after every mutation. */
export async function templateWithCategories(templateId: string, organizationId: string) {
  const template = await prisma.inspectionTemplate.findFirst({
    where: { id: templateId, organizationId },
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { position: 'asc' },
        include: { items: { where: { isActive: true }, orderBy: { position: 'asc' } } },
      },
    },
  });
  if (!template) throw notFound('Template not found');
  return template;
}

/**
 * Swaps a row with its neighbour. Positions are renormalised to 1..n first so a
 * template edited over months never ends up with gaps that break ordering.
 */
export async function moveWithin<T extends { id: string; position: number }>(
  rows: T[],
  id: string,
  direction: 'up' | 'down',
): Promise<{ id: string; position: number }[]> {
  const ordered = [...rows].sort((a, b) => a.position - b.position);
  const index = ordered.findIndex((r) => r.id === id);
  if (index < 0) throw notFound('Item not found');

  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) {
    return ordered.map((r, i) => ({ id: r.id, position: i + 1 }));
  }

  const swapped = [...ordered];
  [swapped[index], swapped[target]] = [swapped[target], swapped[index]];
  return swapped.map((r, i) => ({ id: r.id, position: i + 1 }));
}
