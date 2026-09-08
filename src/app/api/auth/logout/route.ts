import { ok, route } from '@/lib/api';
import { getSessionUser, destroyCurrentSession, requestMeta } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

export const POST = route(async () => {
  const user = await getSessionUser();
  if (user) {
    const meta = await requestMeta();
    await audit(user, {
      action: 'auth.logout',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.name} signed out`,
      ...meta,
    });
  }
  await destroyCurrentSession();
  return ok({ ok: true });
});
