import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, pagination, parseJson, route } from '@/lib/api';
import { assertBranchInScope, findingScope, requireApi } from '@/lib/auth/guard';
import { createFinding, announceFinding } from '@/lib/domain/findings';
import { orgConfig } from '@/lib/domain/settings';
import { deadlineState } from '@/lib/domain/deadlines';

export const GET = route(async (req) => {
  const user = await requireApi('finding:view');
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pagination(url);
  const cfg = await orgConfig(user.organizationId);
  const now = new Date();

  const scope = await findingScope(user);
  const status = url.searchParams.get('status');
  const severity = url.searchParams.get('severity');
  const branchId = url.searchParams.get('branchId');
  const deadline = url.searchParams.get('deadline');
  const assignedToMe = url.searchParams.get('assignedToMe') === 'true';

  const where = {
    ...scope,
    ...(branchId ? { branchId } : {}),
    ...(severity ? { severity: severity as never } : {}),
    ...(assignedToMe ? { assignedToId: user.id } : {}),
    ...(status === 'open'
      ? { status: { notIn: ['CLOSED', 'CANCELLED'] as never[] } }
      : status
        ? { status: status as never }
        : {}),
    ...(deadline === 'overdue'
      ? { dueDate: { lt: now }, status: { notIn: ['CLOSED', 'CANCELLED'] as never[] } }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.finding.count({ where }),
    prisma.finding.findMany({
      where,
      skip,
      take,
      orderBy: [{ severity: 'asc' }, { dueDate: 'asc' }],
      include: {
        branch: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { evidence: true, correctiveActions: true } },
      },
    }),
  ]);

  return ok({
    page,
    pageSize,
    total,
    data: rows.map((f) => ({
      ...f,
      deadlineState: deadlineState(f, cfg.dueSoonHours, now),
    })),
  });
});

const createSchema = z.object({
  branchId: z.string().min(1),
  categoryName: z.string().min(1).max(120),
  itemText: z.string().min(1).max(400),
  observation: z.string().min(1).max(4000),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  assignedToId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
});

/** POST /api/v1/findings — raise a finding outside an inspection. */
export const POST = route(async (req) => {
  const user = await requireApi('finding:create');
  const body = await parseJson(req, createSchema);
  await assertBranchInScope(user, body.branchId);

  const cfg = await orgConfig(user.organizationId);
  const finding = await createFinding(
    user,
    {
      organizationId: user.organizationId,
      branchId: body.branchId,
      categoryName: body.categoryName,
      itemText: body.itemText,
      observation: body.observation,
      severity: body.severity,
      assignedToId: body.assignedToId ?? null,
      dueDate: body.dueDate ?? null,
    },
    cfg,
  );

  await announceFinding(finding.id);
  return ok({ data: finding }, { status: 201 });
});
