import { z } from 'zod';

import { prisma } from '@/lib/db';
import { fail, ok, parseJson, route } from '@/lib/api';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, requestMeta } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const POST = route(async (req) => {
  const { email, password } = await parseJson(req, schema);
  const meta = await requestMeta();

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim() },
    include: { organization: true },
  });

  // Same response and comparable timing whether the account exists or not.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const valid = await verifyPassword(password, hash);

  if (!user || !valid) {
    if (user) {
      await audit(
        { id: user.id, name: user.name, organizationId: user.organizationId },
        {
          action: 'auth.login_failed',
          entityType: 'User',
          entityId: user.id,
          summary: `Failed sign-in attempt for ${user.email}`,
          ...meta,
        },
      );
    }
    return fail(401, 'Incorrect email or password');
  }

  if (!user.isActive) return fail(403, 'This account has been deactivated');
  if (!user.organization.isActive) return fail(403, 'This organization is not active');

  await createSession(user.id, meta);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await audit(
    { id: user.id, name: user.name, organizationId: user.organizationId },
    {
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      summary: `${user.name} signed in`,
      ...meta,
    },
  );

  return ok({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    organization: { id: user.organization.id, name: user.organization.name },
  });
});
