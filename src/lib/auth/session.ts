import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';

import { prisma } from '@/lib/db';
import { env } from '@/lib/env';

export const SESSION_COOKIE = 'bc_session';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  sessionId: string;
};

type TokenPayload = {
  sub: string;
  sid: string;
  org: string;
  role: Role;
};

function secretKey() {
  return new TextEncoder().encode(env().AUTH_SECRET);
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a session: a random opaque token is stored (hashed) in the database so
 * the session can be revoked, and a signed JWT carrying the session id is set as
 * an httpOnly cookie. Revocation is checked on every request.
 */
export async function createSession(
  userId: string,
  meta: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const rawToken = randomBytes(32).toString('base64url');
  const ttlMs = env().SESSION_TTL_HOURS * 3600 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  const jwt = await new SignJWT({
    sub: userId,
    sid: session.id,
    org: user.organizationId,
    role: user.role,
  } satisfies TokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, `${jwt}.${rawToken}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  return session;
}

/**
 * Resolves the current session. Returns null rather than throwing so callers can
 * decide between redirecting (pages) and returning 401 (API).
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const separator = cookie.lastIndexOf('.');
  if (separator < 0) return null;
  const jwt = cookie.slice(0, separator);
  const rawToken = cookie.slice(separator + 1);
  if (!jwt || !rawToken) return null;

  let payload: TokenPayload;
  try {
    const verified = await jwtVerify(jwt, secretKey(), { algorithms: ['HS256'] });
    payload = verified.payload as unknown as TokenPayload;
  } catch {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: { include: { organization: true } } },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  // The cookie must match the stored token: a signed JWT alone is not enough.
  if (session.tokenHash !== hashToken(rawToken)) return null;
  if (!session.user.isActive || !session.user.organization.isActive) return null;

  // Sliding last-seen, throttled to once a minute to avoid a write per request.
  if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    organizationId: session.user.organizationId,
    organizationName: session.user.organization.name,
    organizationSlug: session.user.organization.slug,
    sessionId: session.id,
  };
}

export async function destroyCurrentSession() {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  if (!cookie) return;

  const separator = cookie.lastIndexOf('.');
  if (separator < 0) return;
  try {
    const verified = await jwtVerify(cookie.slice(0, separator), secretKey(), {
      algorithms: ['HS256'],
    });
    const sid = (verified.payload as unknown as TokenPayload).sid;
    await prisma.session.update({ where: { id: sid }, data: { revokedAt: new Date() } });
  } catch {
    // Nothing to revoke.
  }
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

export async function requestMeta() {
  const h = await headers();
  return {
    ipAddress: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: h.get('user-agent'),
  };
}
