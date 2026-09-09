import { createHash } from 'node:crypto';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { badRequest } from '@/lib/auth/guard';
import { hashPassword, passwordProblems } from '@/lib/auth/password';
import { revokeAllSessions, requestMeta } from '@/lib/auth/session';
import { audit } from '@/lib/audit';

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
});

export const POST = route(async (req) => {
  const { token, password } = await parseJson(req, schema);
  const meta = await requestMeta();

  const problems = passwordProblems(password);
  if (problems.length > 0) {
    throw badRequest(`Password does not meet the policy: ${problems.join(', ')}`);
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: createHash('sha256').update(token).digest('hex') },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw badRequest('This reset link is invalid or has expired. Request a new one.');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password) },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // Every existing session is revoked: a password reset must lock out whoever
  // may already be signed in as this user.
  await revokeAllSessions(record.userId);

  await audit(
    { id: record.user.id, name: record.user.name, organizationId: record.user.organizationId },
    {
      action: 'auth.password_reset',
      entityType: 'User',
      entityId: record.user.id,
      summary: `Password reset completed for ${record.user.email}; all sessions revoked`,
      ...meta,
    },
  );

  return ok({ ok: true });
});
