import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { notFound, requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { templateWithCategories } from '@/lib/domain/templates';

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** Deactivated, not deleted — submitted inspections reference this item. */
export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireApi('template:manage');
  const { id, itemId } = await ctx.params;
  const template = await templateWithCategories(id, user.organizationId);
  const meta = await requestMeta();

  const item = template.categories.flatMap((c) => c.items).find((i) => i.id === itemId);
  if (!item) throw notFound('Checklist item not found');

  await prisma.checklistItem.update({ where: { id: itemId }, data: { isActive: false } });

  await audit(user, {
    action: 'template.updated',
    entityType: 'InspectionTemplate',
    entityId: template.id,
    summary: `Removed item "${item.text}" from ${template.name}`,
    before: { itemId, text: item.text },
    ...meta,
  });

  return ok({ data: await templateWithCategories(id, user.organizationId) });
});
