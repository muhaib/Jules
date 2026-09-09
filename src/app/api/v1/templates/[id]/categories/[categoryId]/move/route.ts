import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { moveWithin, templateWithCategories } from '@/lib/domain/templates';

type Ctx = { params: Promise<{ id: string; categoryId: string }> };

const schema = z.object({ direction: z.enum(['up', 'down']) });

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('template:manage');
  const { id, categoryId } = await ctx.params;
  const { direction } = await parseJson(req, schema);
  const template = await templateWithCategories(id, user.organizationId);

  const positions = await moveWithin(template.categories, categoryId, direction);
  await prisma.$transaction(
    positions.map((p) =>
      prisma.inspectionCategory.update({ where: { id: p.id }, data: { position: p.position } }),
    ),
  );

  return ok({ data: await templateWithCategories(id, user.organizationId) });
});
