import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { loadEditableInspection } from '@/lib/domain/inspections';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, ctx: Ctx) => {
  const user = await requireApi('inspection:conduct');
  const { id } = await ctx.params;
  const inspection = await loadEditableInspection(user, id);
  const meta = await requestMeta();

  if (inspection.status === 'IN_PROGRESS') return ok({ data: inspection });

  const updated = await prisma.inspection.update({
    where: { id: inspection.id },
    data: { status: 'IN_PROGRESS', startedAt: inspection.startedAt ?? new Date() },
  });

  await audit(user, {
    action: 'inspection.started',
    entityType: 'Inspection',
    entityId: inspection.id,
    summary: `Started ${inspection.reference}`,
    ...meta,
  });

  return ok({ data: updated });
});
