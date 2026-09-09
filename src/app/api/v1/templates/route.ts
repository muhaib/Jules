import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';

export const GET = route(async () => {
  const user = await requireApi('template:view');
  const templates = await prisma.inspectionTemplate.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: 'asc' },
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { position: 'asc' },
        include: { items: { where: { isActive: true }, orderBy: { position: 'asc' } } },
      },
    },
  });
  return ok({ data: templates });
});

const schema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  branchType: z.string().max(80).optional(),
});

export const POST = route(async (req) => {
  const user = await requireApi('template:manage');
  const body = await parseJson(req, schema);
  const meta = await requestMeta();

  const template = await prisma.inspectionTemplate.create({
    data: {
      organizationId: user.organizationId,
      name: body.name,
      description: body.description ?? null,
      branchType: body.branchType || null,
    },
  });

  await audit(user, {
    action: 'template.created',
    entityType: 'InspectionTemplate',
    entityId: template.id,
    summary: `Created template "${template.name}"`,
    ...meta,
  });

  return ok({ data: template }, { status: 201 });
});
