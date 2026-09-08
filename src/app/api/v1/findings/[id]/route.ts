import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { findingScope, notFound, requireApi } from '@/lib/auth/guard';
import { orgConfig } from '@/lib/domain/settings';
import { deadlineState, describeRemaining, escalationLabel } from '@/lib/domain/deadlines';

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireApi('finding:view');
  const { id } = await ctx.params;
  const scope = await findingScope(user);
  const cfg = await orgConfig(user.organizationId);

  const finding = await prisma.finding.findFirst({
    where: { ...scope, id },
    include: {
      branch: { select: { id: true, name: true, code: true, city: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      inspection: { select: { id: true, reference: true, submittedAt: true } },
      evidence: {
        orderBy: { capturedAt: 'asc' },
        include: { uploadedBy: { select: { id: true, name: true } } },
      },
      correctiveActions: {
        orderBy: { attempt: 'desc' },
        include: {
          submittedBy: { select: { id: true, name: true } },
          verifiedBy: { select: { id: true, name: true } },
          evidence: true,
        },
      },
    },
  });
  if (!finding) throw notFound('Finding not found');

  const history = await prisma.finding.findMany({
    where: {
      organizationId: user.organizationId,
      recurrenceKey: finding.recurrenceKey,
      id: { not: finding.id },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, number: true, createdAt: true, status: true, severity: true },
  });

  return ok({
    data: {
      ...finding,
      deadlineState: deadlineState(finding, cfg.dueSoonHours),
      remaining: describeRemaining(finding.dueDate, finding.status),
      escalatedTo: escalationLabel(finding.escalationLevel),
      previousOccurrences: history,
    },
  });
});
