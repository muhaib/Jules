import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { notFound, requireApi } from '@/lib/auth/guard';

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req, ctx: Ctx) => {
  const user = await requireApi();
  const { id } = await ctx.params;

  // Scoped by userId so one user can never mark another's notification read.
  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.count({ where: { id, userId: user.id } });
    if (!exists) throw notFound('Notification not found');
  }
  return ok({ ok: true });
});
