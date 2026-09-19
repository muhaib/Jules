import { Router } from 'express';
import {
  checkPassword, clearSession, DUMMY_PASSWORD_HASH, hashPassword, issueSession, requireUser,
} from '../auth.js';
import { query } from '../db.js';
import { HttpError, requireEmail, requireStr, str } from '../validate.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false') {
    throw new HttpError(403, 'registration_closed');
  }
  const email = requireEmail(req.body);
  const password = requireStr(req.body, 'password', { min: 10, max: 200 });
  const name = str(req.body?.name, { max: 120 });

  const existing = await query('SELECT 1 FROM users WHERE email_lower = lower($1)', [email]);
  if (existing.rowCount) throw new HttpError(409, 'email_already_registered');

  const { rows } = await query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
    [email, await hashPassword(password), name],
  );
  issueSession(res, rows[0]);
  return res.status(201).json({ user: rows[0] });
});

authRouter.post('/login', async (req, res) => {
  const email = requireEmail(req.body);
  const password = requireStr(req.body, 'password', { min: 1, max: 200 });
  const { rows } = await query(
    'SELECT id, email, name, password_hash, created_at FROM users WHERE email_lower = lower($1)',
    [email],
  );
  const user = rows[0];
  // Same response and the same cost whether the account exists or the password
  // is wrong: an unknown email still pays for one bcrypt comparison, against a
  // real hash of a value nobody knows.
  const ok = user
    ? await checkPassword(password, user.password_hash)
    : await checkPassword(password, DUMMY_PASSWORD_HASH);
  if (!ok) throw new HttpError(401, 'invalid_credentials');

  issueSession(res, user);
  return res.json({ user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at } });
});

authRouter.post('/logout', (req, res) => {
  clearSession(res);
  return res.json({ ok: true });
});

authRouter.get('/me', requireUser, (req, res) => res.json({ user: req.user }));
