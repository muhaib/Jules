import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, pagination, parseJson, route } from '@/lib/api';
import { assertBranchInScope, assertCan, inspectionScope, requireApi } from '@/lib/auth/guard';
import { assignInspection } from '@/lib/domain/inspections';

/** GET /api/v1/inspections — list, scoped to what the caller may see. */
export const GET = route(async (req) => {
  const user = await requireApi('inspection:view');
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pagination(url);

  const scope = await inspectionScope(user);
  const status = url.searchParams.get('status');
  const branchId = url.searchParams.get('branchId');
  const mine = url.searchParams.get('mine') === 'true';

  const where = {
    ...scope,
    ...(status ? { status: status as never } : {}),
    ...(branchId ? { branchId } : {}),
    ...(mine ? { inspectorId: user.id } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.inspection.count({ where }),
    prisma.inspection.findMany({
      where,
      skip,
      take,
      orderBy: [{ submittedAt: 'desc' }, { scheduledFor: 'desc' }],
      include: {
        branch: { select: { id: true, name: true, code: true, city: true } },
        template: { select: { id: true, name: true } },
        inspector: { select: { id: true, name: true } },
        _count: { select: { findings: true } },
      },
    }),
  ]);

  return ok({ page, pageSize, total, data: rows });
});

const createSchema = z.object({
  branchId: z.string().min(1),
  templateId: z.string().min(1),
  inspectorId: z.string().min(1),
  scheduledFor: z.coerce.date(),
  notes: z.string().max(2000).optional(),
});

/** POST /api/v1/inspections — assign an inspection. */
export const POST = route(async (req) => {
  const user = await requireApi('inspection:assign');
  const body = await parseJson(req, createSchema);
  assertCan(user, 'inspection:assign');
  await assertBranchInScope(user, body.branchId);

  const inspection = await assignInspection(user, body);
  return ok({ data: inspection }, { status: 201 });
});
