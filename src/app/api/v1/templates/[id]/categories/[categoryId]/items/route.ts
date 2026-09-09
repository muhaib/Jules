import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { notFound, requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { templateWithCategories } from '@/lib/domain/templates';

type Ctx = { params: Promise<{ id: string; categoryId: string }> };

const schema = z.object({
  text: z.string().min(1).max(400),
  guidance: z.string().max(1000).nullable().optional(),
  weight: z.coerce.number().int().min(1).max(10).default(1),
  defaultSeverity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).default('MEDIUM'),
  isMandatory: z.boolean().default(true),
  requirePhotoOnFail: z.boolean().default(true),
});

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('template:manage');
  const { id, categoryId } = await ctx.params;
  const body = await parseJson(req, schema);
  const template = await templateWithCategories(id, user.organizationId);
  const meta = await requestMeta();

  const category = template.categories.find((c) => c.id === categoryId);
  if (!category) throw notFound('Category not found');

  await prisma.checklistItem.create({
    data: {
      categoryId,
      text: body.text,
      guidance: body.guidance ?? null,
      weight: body.weight,
      defaultSeverity: body.defaultSeverity,
      isMandatory: body.isMandatory,
      requirePhotoOnFail: body.requirePhotoOnFail,
      position: category.items.length + 1,
    },
  });

  await audit(user, {
    action: 'template.updated',
    entityType: 'InspectionTemplate',
    entityId: template.id,
    summary: `Added item "${body.text}" to ${category.name}`,
    ...meta,
  });

  return ok({ data: await templateWithCategories(id, user.organizationId) }, { status: 201 });
});
