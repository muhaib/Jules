/** Everything the Next.js dashboard reads and writes. Session-authenticated. */
import { Router } from 'express';
import { buildRobotsTxt, createPolicy } from '@ai-crawler-guard/core';
import { generateSiteKey, requireUser } from '../auth.js';
import { query } from '../db.js';
import { catalog } from '../catalog.js';
import { HttpError, clampInt, isUuid, parseDate, requireStr, str } from '../validate.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireUser);

/** Scopes every site route to the signed-in owner. Ownership is checked in SQL. */
async function loadSite(req, res, next) {
  if (!isUuid(req.params.siteId)) throw new HttpError(404, 'site_not_found');
  const { rows } = await query(
    `SELECT id, name, domain, notify_email, policy, key_prefix, created_at, key_rotated_at
       FROM sites WHERE id = $1 AND user_id = $2`,
    [req.params.siteId, req.user.id],
  );
  if (!rows.length) throw new HttpError(404, 'site_not_found');
  req.site = rows[0];
  return next();
}

dashboardRouter.get('/crawlers', (req, res) => {
  const current = catalog();
  res.json({
    version: current.version,
    crawlers: current.crawlers.map((crawler) => ({
      id: crawler.id,
      name: crawler.name,
      operator: crawler.operator,
      purpose: crawler.purpose,
      robotsToken: crawler.robotsToken,
      robotsOnly: crawler.robotsOnly,
      deprecated: crawler.deprecated,
      docs: crawler.docs,
      note: crawler.note,
      verifiable: crawler.verification.methods.length > 0,
      verificationMethods: crawler.verification.methods,
    })),
  });
});

dashboardRouter.get('/sites', async (req, res) => {
  const { rows } = await query(
    `SELECT s.id, s.name, s.domain, s.key_prefix, s.created_at,
            (SELECT count(*) FROM bot_events e
              WHERE e.site_id = s.id AND e.ts > now() - interval '7 days') AS hits_7d,
            (SELECT count(*) FROM licensing_inquiries i
              WHERE i.site_id = s.id AND i.status = 'new') AS new_inquiries
       FROM sites s WHERE s.user_id = $1 ORDER BY s.created_at`,
    [req.user.id],
  );
  res.json({ sites: rows.map((row) => ({ ...row, hits_7d: Number(row.hits_7d), new_inquiries: Number(row.new_inquiries) })) });
});

dashboardRouter.post('/sites', async (req, res) => {
  const name = requireStr(req.body, 'name', { max: 120 });
  const domain = str(req.body?.domain, { max: 255 });
  const { key, hash, prefix } = generateSiteKey();
  const { rows } = await query(
    `INSERT INTO sites (user_id, name, domain, key_hash, key_prefix, policy)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, domain, key_prefix, policy, created_at`,
    [req.user.id, name, domain, hash, prefix, JSON.stringify(defaultPolicyDocument())],
  );
  // The only time the key is ever returned.
  res.status(201).json({ site: rows[0], siteKey: key });
});

function defaultPolicyDocument() {
  // Start in observe-only mode. Turning a brand new install into a blocker
  // without the owner looking at a single number first is how you lose search
  // traffic by accident.
  return { defaultAction: 'log', onSpoofed: 'block', onUnknown: 'inherit', onUnverifiable: 'inherit', rules: {} };
}

dashboardRouter.get('/sites/:siteId', loadSite, (req, res) => res.json({ site: req.site }));

dashboardRouter.patch('/sites/:siteId', loadSite, async (req, res) => {
  const name = str(req.body?.name, { max: 120 }) ?? req.site.name;
  const domain = req.body?.domain === null ? null : str(req.body?.domain, { max: 255 }) ?? req.site.domain;
  const notifyEmail = req.body?.notifyEmail === null
    ? null
    : str(req.body?.notifyEmail, { max: 254 }) ?? req.site.notify_email;
  const { rows } = await query(
    'UPDATE sites SET name = $2, domain = $3, notify_email = $4 WHERE id = $1 RETURNING id, name, domain, notify_email, key_prefix, policy, created_at',
    [req.site.id, name, domain, notifyEmail],
  );
  res.json({ site: rows[0] });
});

dashboardRouter.post('/sites/:siteId/key', loadSite, async (req, res) => {
  const { key, hash, prefix } = generateSiteKey();
  await query(
    'UPDATE sites SET key_hash = $2, key_prefix = $3, key_rotated_at = now() WHERE id = $1',
    [req.site.id, hash, prefix],
  );
  res.json({ siteKey: key, keyPrefix: prefix });
});

dashboardRouter.get('/sites/:siteId/policy', loadSite, (req, res) => {
  const policy = createPolicy(req.site.policy ?? {}, { catalog: catalog() });
  res.json({ policy: policy.toJSON() });
});

dashboardRouter.put('/sites/:siteId/policy', loadSite, async (req, res) => {
  let policy;
  try {
    // Compile before storing: an invalid policy must be rejected here, not
    // discovered by a middleware in production.
    policy = createPolicy(req.body?.policy ?? req.body ?? {}, { catalog: catalog() });
  } catch (error) {
    throw new HttpError(400, 'invalid_policy', { message: error.message, path: error.path ?? null });
  }
  const document = policy.toJSON();
  await query('UPDATE sites SET policy = $2 WHERE id = $1', [req.site.id, JSON.stringify(document)]);
  res.json({ policy: document });
});

dashboardRouter.get('/sites/:siteId/robots.txt', loadSite, (req, res) => {
  const policy = createPolicy(req.site.policy ?? {}, { catalog: catalog() });
  const origin = req.site.domain ? `https://${req.site.domain.replace(/^https?:\/\//, '')}` : null;
  const text = buildRobotsTxt({
    catalog: catalog(),
    policy,
    existing: typeof req.query.existing === 'string' ? req.query.existing : '',
    licensingUrl: origin ? `${origin}/.well-known/ai-licensing` : null,
    sitemaps: origin && req.query.sitemap === 'true' ? [`${origin}/sitemap.xml`] : [],
  });
  res.type('text/plain').send(text);
});

// ---- analytics -------------------------------------------------------------

function range(req) {
  const to = parseDate(req.query.to, new Date());
  const from = parseDate(req.query.from, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000));
  if (from > to) throw new HttpError(400, 'from_after_to');
  return { from: from.toISOString(), to: to.toISOString() };
}

dashboardRouter.get('/sites/:siteId/overview', loadSite, async (req, res) => {
  const { from, to } = range(req);
  const args = [req.site.id, from, to];

  const [totals, byCrawler, byPage, timeline, byVerification, recentInquiries] = await Promise.all([
    query(
      `SELECT count(*)::int AS hits,
              count(DISTINCT bot_id)::int AS crawlers,
              count(DISTINCT path)::int AS pages,
              count(*) FILTER (WHERE action = 'block')::int   AS blocked,
              count(*) FILTER (WHERE action = 'license')::int AS licensed,
              count(*) FILTER (WHERE action IN ('allow','log'))::int AS served,
              count(*) FILTER (WHERE verification = 'spoofed')::int AS spoofed
         FROM bot_events WHERE site_id = $1 AND ts >= $2 AND ts <= $3`,
      args,
    ),
    query(
      `SELECT bot_id, max(bot_name) AS bot_name, max(operator) AS operator, max(purpose) AS purpose,
              count(*)::int AS hits,
              count(*) FILTER (WHERE action = 'block')::int   AS blocked,
              count(*) FILTER (WHERE action = 'license')::int AS licensed,
              count(*) FILTER (WHERE verification = 'verified')::int AS verified,
              count(*) FILTER (WHERE verification = 'spoofed')::int  AS spoofed,
              count(DISTINCT path)::int AS pages,
              max(ts) AS last_seen
         FROM bot_events WHERE site_id = $1 AND ts >= $2 AND ts <= $3
        GROUP BY bot_id ORDER BY hits DESC`,
      args,
    ),
    query(
      `SELECT path, count(*)::int AS hits,
              count(DISTINCT bot_id)::int AS crawlers,
              count(*) FILTER (WHERE action = 'block')::int AS blocked,
              (array_agg(bot_id ORDER BY ts DESC))[1] AS last_bot,
              max(ts) AS last_seen
         FROM bot_events WHERE site_id = $1 AND ts >= $2 AND ts <= $3
        GROUP BY path ORDER BY hits DESC LIMIT 50`,
      args,
    ),
    query(
      `SELECT date_trunc('day', ts) AS day, action, count(*)::int AS hits
         FROM bot_events WHERE site_id = $1 AND ts >= $2 AND ts <= $3
        GROUP BY 1, 2 ORDER BY 1`,
      args,
    ),
    query(
      `SELECT verification, count(*)::int AS hits
         FROM bot_events WHERE site_id = $1 AND ts >= $2 AND ts <= $3
        GROUP BY verification`,
      args,
    ),
    query(
      `SELECT id, name, email, organization, intended_use, status, created_at
         FROM licensing_inquiries WHERE site_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [req.site.id],
    ),
  ]);

  res.json({
    range: { from, to },
    totals: totals.rows[0],
    byCrawler: byCrawler.rows,
    byPage: byPage.rows,
    timeline: timeline.rows,
    byVerification: Object.fromEntries(byVerification.rows.map((row) => [row.verification, row.hits])),
    recentInquiries: recentInquiries.rows,
  });
});

dashboardRouter.get('/sites/:siteId/events', loadSite, async (req, res) => {
  const limit = clampInt(req.query.limit, { min: 1, max: 200, fallback: 50 });
  const filters = ['site_id = $1'];
  const args = [req.site.id];
  for (const [param, column] of [['botId', 'bot_id'], ['action', 'action'], ['verification', 'verification']]) {
    const value = str(req.query[param], { max: 64 });
    if (value) {
      args.push(value);
      filters.push(`${column} = $${args.length}`);
    }
  }
  // Keyset pagination: OFFSET degrades badly once a crawl has produced a few
  // hundred thousand rows.
  const before = str(req.query.before, { max: 32 });
  if (before) {
    args.push(before);
    filters.push(`id < $${args.length}`);
  }
  args.push(limit);
  const { rows } = await query(
    `SELECT id, ts, bot_id, bot_name, path, method, action, verification, verification_reason,
            client_ip, response_status, rule_source
       FROM bot_events WHERE ${filters.join(' AND ')}
      ORDER BY id DESC LIMIT $${args.length}`,
    args,
  );
  res.json({ events: rows, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null });
});

// ---- licensing inquiries ---------------------------------------------------

dashboardRouter.get('/sites/:siteId/inquiries', loadSite, async (req, res) => {
  const status = str(req.query.status, { max: 20 });
  const args = [req.site.id];
  let filter = '';
  if (status) {
    args.push(status);
    filter = ' AND status = $2';
  }
  const { rows } = await query(
    `SELECT * FROM licensing_inquiries WHERE site_id = $1${filter} ORDER BY created_at DESC LIMIT 200`,
    args,
  );
  res.json({ inquiries: rows });
});

const INQUIRY_STATUSES = new Set(['new', 'contacted', 'agreed', 'declined']);

dashboardRouter.patch('/sites/:siteId/inquiries/:inquiryId', loadSite, async (req, res) => {
  if (!isUuid(req.params.inquiryId)) throw new HttpError(404, 'inquiry_not_found');
  const status = str(req.body?.status, { max: 20 });
  if (status && !INQUIRY_STATUSES.has(status)) {
    throw new HttpError(400, 'invalid_status', { allowed: [...INQUIRY_STATUSES] });
  }
  const notes = req.body?.notes === undefined ? undefined : str(req.body.notes, { max: 4000 });
  const { rows } = await query(
    `UPDATE licensing_inquiries
        SET status = coalesce($3, status),
            notes  = CASE WHEN $4::boolean THEN $5 ELSE notes END
      WHERE id = $1 AND site_id = $2 RETURNING *`,
    [req.params.inquiryId, req.site.id, status, notes !== undefined, notes ?? null],
  );
  if (!rows.length) throw new HttpError(404, 'inquiry_not_found');
  res.json({ inquiry: rows[0] });
});
