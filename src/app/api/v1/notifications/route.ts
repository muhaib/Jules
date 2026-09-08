import { prisma } from '@/lib/db';
import { ok, pagination, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';

export const GET = route(async (req) => {
  const user = await requireApi();
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pagination(url, 30);
  const unreadOnly = url.searchParams.get('unread') === 'true';

  const where = { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) };

  const [total, unread, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
  ]);

  return ok({ page, pageSize, total, unread, data: rows });
});
