import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';

export const SESSION_COOKIE = 'aicg_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return secret;
}

export function issueSession(res, user) {
  const token = jwt.sign({ sub: user.id, email: user.email }, sessionSecret(), {
    expiresIn: SESSION_TTL_SECONDS,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
  return token;
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Cookie first, then `Authorization: Bearer` so the dashboard can call server-side. */
function tokenFrom(req) {
  if (req.cookies?.[SESSION_COOKIE]) return req.cookies[SESSION_COOKIE];
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ') && !header.slice(7).startsWith('aicg_')) {
    return header.slice(7);
  }
  return null;
}

export async function requireUser(req, res, next) {
  const token = tokenFrom(req);
  if (!token) return res.status(401).json({ error: 'not_authenticated' });
  let payload;
  try {
    payload = jwt.verify(token, sessionSecret());
  } catch {
    return res.status(401).json({ error: 'not_authenticated' });
  }
  const { rows } = await query('SELECT id, email, name, created_at FROM users WHERE id = $1', [payload.sub]);
  if (!rows.length) return res.status(401).json({ error: 'not_authenticated' });
  req.user = rows[0];
  return next();
}

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function checkPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ---- site keys -------------------------------------------------------------
// The key is shown once and stored only as a SHA-256 digest. It is a
// high-entropy random string rather than a password, so a fast hash is the
// right choice: there is nothing to brute-force offline.

const KEY_PREFIX = 'aicg_live_';

export function generateSiteKey() {
  const secret = randomBytes(24).toString('base64url');
  const key = `${KEY_PREFIX}${secret}`;
  return { key, hash: hashSiteKey(key), prefix: key.slice(0, KEY_PREFIX.length + 6) };
}

export function hashSiteKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

function safeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

/** Authenticates a middleware instance and attaches `req.site`. */
export async function requireSiteKey(req, res, next) {
  const header = req.get('authorization') ?? '';
  const key = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!key || !key.startsWith(KEY_PREFIX)) {
    return res.status(401).json({ error: 'missing_site_key' });
  }
  const hash = hashSiteKey(key);
  const { rows } = await query(
    'SELECT id, user_id, name, domain, policy FROM sites WHERE key_hash = $1',
    [hash],
  );
  if (!rows.length || !safeEqualHex(hash, hashSiteKey(key))) {
    return res.status(401).json({ error: 'invalid_site_key' });
  }
  req.site = rows[0];
  return next();
}
