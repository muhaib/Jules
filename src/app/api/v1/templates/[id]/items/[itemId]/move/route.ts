import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { notFound, requireApi } from '@/lib/auth/guard';
import { moveWithin, templateWithCategories } from '@/lib/domain/templates';

type Ctx = { params: Promise<{ id: string; itemId: string }> };

const schema = z.object({ direction: z.enum(['up', 'down']) });

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('template:manage');
  const { id, itemId } = await ctx.params;
  const { direction } = await parseJson(req, schema);
  const template = await templateWithCategories(id, user.organizationId);

  const category = template.categories.find((c) => c.items.some((i) => i.id === itemId));
  if (!category) throw notFound('Checklist item not found');

  const positions = await moveWithin(category.items, itemId, direction);
  await prisma.$transaction(
    positions.map((p) =>
      prisma.checklistItem.update({ where: { id: p.id }, data: { position: p.position } }),
    ),
  );

  return ok({ data: await templateWithCategories(id, user.organizationId) });
});
