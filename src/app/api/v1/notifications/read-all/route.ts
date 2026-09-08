import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';

export const POST = route(async () => {
  const user = await requireApi();
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return ok({ marked: result.count });
});
