import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { env } from '@/lib/env';

const schema = z.object({ email: z.string().email() });
const TTL_MINUTES = 60;

/**
 * POST /api/auth/forgot-password
 *
 * Always returns the same response whether or not the account exists — the
 * endpoint must not become a way to enumerate valid email addresses.
 *
 * The reset link is returned in the response body ONLY outside production,
 * because this deployment has no mail transport wired up. In production the
 * link is logged for the operator's mailer to pick up and never returned.
 */
export const POST = route(async (req) => {
  const { email } = await parseJson(req, schema);
  const meta = await requestMeta();
  const generic = { ok: true, message: 'If that email is registered, a reset link has been sent.' };

  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase().trim(), isActive: true },
  });
  if (!user) return ok(generic);

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  // Any outstanding tokens are burned so only the newest link works.
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt,
      },
    }),
  ]);

  await audit(
    { id: user.id, name: user.name, organizationId: user.organizationId },
    {
      action: 'auth.password_reset_requested',
      entityType: 'User',
      entityId: user.id,
      summary: `Password reset requested for ${user.email}`,
      ...meta,
    },
  );

  const link = `${env().APP_URL}/reset-password?token=${token}`;
  if (process.env.NODE_ENV === 'production') {
    console.info(`[auth] password reset link for ${user.email}: ${link}`);
    return ok(generic);
  }

  return ok({ ...generic, devResetLink: link });
});
