import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { templateWithCategories } from '@/lib/domain/templates';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  name: z.string().min(1).max(120),
  weight: z.coerce.number().int().min(1).max(10).default(1),
});

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('template:manage');
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const template = await templateWithCategories(id, user.organizationId);
  const meta = await requestMeta();

  const position = template.categories.length + 1;
  await prisma.inspectionCategory.create({
    data: { templateId: template.id, name: body.name, weight: body.weight, position },
  });

  await audit(user, {
    action: 'template.updated',
    entityType: 'InspectionTemplate',
    entityId: template.id,
    summary: `Added category "${body.name}" to ${template.name}`,
    ...meta,
  });

  return ok({ data: await templateWithCategories(id, user.organizationId) }, { status: 201 });
});
