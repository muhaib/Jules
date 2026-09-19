/**
 * Everything the middleware talks to: event ingest, inquiry delivery, policy
 * pull and catalog pull. Authenticated with a site key, never a user session.
 */
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { createPolicy } from '@ai-crawler-guard/core';
import { requireSiteKey } from '../auth.js';
import { query } from '../db.js';
import { catalog, catalogDocument } from '../catalog.js';
import { notifyInquiry } from '../mailer.js';
import { HttpError, clampInt, str } from '../validate.js';

const MAX_EVENTS_PER_BATCH = 500;
const VERIFICATION_STATES = new Set(['verified', 'spoofed', 'unknown', 'unverifiable']);
const ACTIONS = new Set(['allow', 'log', 'license', 'block']);

function fingerprint(siteId, event) {
  return createHash('sha256')
    .update([siteId, event.ts, event.botId, event.path, event.clientIp ?? '', event.method ?? ''].join('|'))
    .digest('hex');
}

function normaliseEvent(siteId, input) {
  const ts = new Date(input?.ts ?? Date.now());
  if (Number.isNaN(ts.getTime())) throw new HttpError(400, 'invalid_event_timestamp');
  const botId = str(input?.botId, { max: 64 });
  if (!botId) throw new HttpError(400, 'invalid_event_botId');
  const verification = VERIFICATION_STATES.has(input?.verification) ? input.verification : 'unknown';
  const action = ACTIONS.has(input?.action) ? input.action : 'log';

  const event = {
    ts: ts.toISOString(),
    botId,
    botName: str(input?.botName, { max: 120 }),
    operator: str(input?.operator, { max: 120 }),
    purpose: str(input?.purpose, { max: 32 }),
    path: str(input?.path, { max: 1000 }) ?? '/',
    method: str(input?.method, { max: 10 }),
    host: str(input?.host, { max: 255 }),
    referrer: str(input?.referrer, { max: 1000 }),
    userAgent: str(input?.userAgent, { max: 512 }),
    clientIp: str(input?.ip, { max: 100 }),
    verification,
    verificationMethod: str(input?.verificationMethod, { max: 32 }),
    verificationReason: str(input?.verificationReason, { max: 120 }),
    action,
    ruleSource: str(input?.ruleSource, { max: 120 }),
    responseStatus: Number.isInteger(input?.responseStatus) ? input.responseStatus : null,
  };
  event.fingerprint = fingerprint(siteId, event);
  return event;
}

export const ingestRouter = Router();

ingestRouter.post('/ingest', requireSiteKey, async (req, res) => {
  const events = req.body?.events;
  if (!Array.isArray(events)) throw new HttpError(400, 'events_must_be_an_array');
  if (events.length > MAX_EVENTS_PER_BATCH) {
    throw new HttpError(413, 'batch_too_large', { max: MAX_EVENTS_PER_BATCH });
  }
  if (!events.length) return res.status(202).json({ accepted: 0, duplicates: 0 });

  const rows = events.map((event) => normaliseEvent(req.site.id, event));

  // One multi-row insert: an ingest endpoint that does N round trips falls
  // over exactly when a crawl is at its busiest.
  const columns = [
    'site_id', 'ts', 'bot_id', 'bot_name', 'operator', 'purpose', 'path', 'method',
    'host', 'referrer', 'user_agent', 'client_ip', 'verification', 'verification_method',
    'verification_reason', 'action', 'rule_source', 'response_status', 'fingerprint',
  ];
  const values = [];
  const tuples = rows.map((row, index) => {
    const base = index * columns.length;
    values.push(
      req.site.id, row.ts, row.botId, row.botName, row.operator, row.purpose, row.path,
      row.method, row.host, row.referrer, row.userAgent, row.clientIp, row.verification,
      row.verificationMethod, row.verificationReason, row.action, row.ruleSource,
      row.responseStatus, row.fingerprint,
    );
    return `(${columns.map((_, i) => `$${base + i + 1}`).join(',')})`;
  });

  const result = await query(
    `INSERT INTO bot_events (${columns.join(',')}) VALUES ${tuples.join(',')}
     ON CONFLICT (fingerprint) DO NOTHING`,
    values,
  );
  return res.status(202).json({
    accepted: result.rowCount,
    duplicates: rows.length - result.rowCount,
  });
});

ingestRouter.post('/inquiries', requireSiteKey, async (req, res) => {
  const body = req.body ?? {};
  const name = str(body.name, { max: 120 });
  const email = str(body.email, { max: 254 });
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'name_and_email_required');
  }

  const { rows } = await query(
    `INSERT INTO licensing_inquiries
       (site_id, name, email, organization, intended_use, message, crawler_id, requested_path, client_ip, user_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      req.site.id, name, email,
      str(body.organization, { max: 160 }),
      str(body.intendedUse, { max: 40 }),
      str(body.message, { max: 4000 }),
      str(body.crawlerId, { max: 64 }),
      str(body.requestedPath, { max: 500 }),
      str(body.ip, { max: 100 }),
      str(body.userAgent, { max: 512 }),
    ],
  );
  const inquiry = rows[0];

  // Storing it is the guarantee; emailing is best effort on top.
  try {
    const owner = (await query(
      'SELECT u.email FROM users u JOIN sites s ON s.user_id = u.id WHERE s.id = $1',
      [req.site.id],
    )).rows[0];
    const site = (await query('SELECT name, notify_email FROM sites WHERE id = $1', [req.site.id])).rows[0];
    const sent = await notifyInquiry({
      inquiry,
      site,
      owner,
      dashboardUrl: process.env.DASHBOARD_URL
        ? `${process.env.DASHBOARD_URL.replace(/\/$/, '')}/sites/${req.site.id}/inquiries`
        : null,
    });
    if (sent) {
      await query('UPDATE licensing_inquiries SET notified_at = now() WHERE id = $1', [inquiry.id]);
    }
  } catch (error) {
    console.error('[inquiry] stored but notification failed:', error.message);
  }

  return res.status(201).json({ id: inquiry.id, status: 'received' });
});

ingestRouter.get('/policy', requireSiteKey, async (req, res) => {
  // Compile on the way out so a middleware never receives a policy it will
  // reject. Rules naming a crawler that has since left the catalog are
  // dropped with a warning rather than failing the poll - a stale key must
  // not take a site's whole policy offline.
  const policy = createPolicy(req.site.policy ?? {}, {
    catalog: catalog(),
    ignoreUnknownRules: true,
    onUnknownRule: (id) => console.warn(`[policy] site ${req.site.id}: dropping rule for unknown crawler "${id}"`),
  });
  res.set('cache-control', 'no-store');
  return res.json({ siteId: req.site.id, policy: policy.toJSON(), catalogVersion: catalog().version });
});

ingestRouter.get('/crawlers', requireSiteKey, (req, res) => {
  res.set('cache-control', 'public, max-age=300');
  return res.json(catalogDocument());
});

/** Lets an operator confirm a key works before wiring it into production. */
ingestRouter.get('/whoami', requireSiteKey, (req, res) => res.json({
  siteId: req.site.id,
  siteName: req.site.name,
  domain: req.site.domain,
}));

export { clampInt };
