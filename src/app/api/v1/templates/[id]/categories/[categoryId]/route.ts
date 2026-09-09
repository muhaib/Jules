import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { notFound, requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { templateWithCategories } from '@/lib/domain/templates';

type Ctx = { params: Promise<{ id: string; categoryId: string }> };

/**
 * Categories are deactivated rather than deleted: submitted inspections
 * reference their checklist items, and history must not be destroyed by an
 * edit to the template.
 */
export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireApi('template:manage');
  const { id, categoryId } = await ctx.params;
  const template = await templateWithCategories(id, user.organizationId);
  const meta = await requestMeta();

  const category = template.categories.find((c) => c.id === categoryId);
  if (!category) throw notFound('Category not found');

  await prisma.$transaction([
    prisma.checklistItem.updateMany({ where: { categoryId }, data: { isActive: false } }),
    prisma.inspectionCategory.update({ where: { id: categoryId }, data: { isActive: false } }),
  ]);

  await audit(user, {
    action: 'template.updated',
    entityType: 'InspectionTemplate',
    entityId: template.id,
    summary: `Removed category "${category.name}" from ${template.name}`,
    before: { categoryId, name: category.name, items: category.items.length },
    ...meta,
  });

  return ok({ data: await templateWithCategories(id, user.organizationId) });
});
