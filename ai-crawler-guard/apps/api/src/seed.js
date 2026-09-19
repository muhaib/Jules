#!/usr/bin/env node
/**
 * Demo data: one account, one site, and a month of plausible crawler traffic
 * so the dashboard has something real-shaped to render on a fresh install.
 */
import { createHash, randomInt } from 'node:crypto';
import './env.js';
import { generateSiteKey, hashPassword } from './auth.js';
import { closePool, query } from './db.js';
import { loadCatalog } from './catalog.js';
import { migrate } from './migrate.js';

const EMAIL = process.env.SEED_EMAIL ?? 'owner@example.com';
const PASSWORD = process.env.SEED_PASSWORD ?? 'demo-password-1234';

const PAGES = [
  '/', '/pricing', '/blog/how-we-built-it', '/blog/the-2026-report',
  '/blog/interview-with-a-founder', '/docs/getting-started', '/docs/api',
  '/archive/2025/field-notes', '/archive/2024/annual-review', '/about',
];

// Rough shares: a handful of crawlers do most of the work.
const MIX = [
  ['gptbot', 0.24], ['claudebot', 0.16], ['ccbot', 0.13], ['bytespider', 0.11],
  ['perplexitybot', 0.09], ['googleother', 0.07], ['amazonbot', 0.06],
  ['meta-externalagent', 0.05], ['applebot', 0.04], ['chatgpt-user', 0.03],
  ['claude-user', 0.02],
];

function pick(mix) {
  let roll = Math.random();
  for (const [id, share] of mix) {
    roll -= share;
    if (roll <= 0) return id;
  }
  return mix[0][0];
}

function verificationFor(crawler) {
  if (!crawler.verification.methods.length) return ['unverifiable', null, 'operator_publishes_no_verification_method'];
  if (Math.random() < 0.06) return ['spoofed', crawler.verification.methods[0], 'forward_confirm_mismatch'];
  if (Math.random() < 0.08) return ['unknown', crawler.verification.methods[0], 'published_ranges_not_loaded'];
  const method = crawler.verification.methods[0];
  return ['verified', method, method === 'dns' ? 'reverse_and_forward_confirmed' : 'ip_in_published_ranges'];
}

async function main() {
  await migrate({ log: (line) => console.log(`[migrate] ${line}`) });
  const catalog = await loadCatalog();

  await query('DELETE FROM users WHERE email_lower = lower($1)', [EMAIL]);
  const user = (await query(
    'INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email',
    [EMAIL, await hashPassword(PASSWORD), 'Demo Owner'],
  )).rows[0];

  const policy = {
    defaultAction: 'log',
    onSpoofed: 'block',
    onUnknown: 'inherit',
    onUnverifiable: 'inherit',
    rules: {
      gptbot: { action: 'block' },
      ccbot: { action: 'block' },
      bytespider: { action: 'block' },
      claudebot: { action: 'license' },
      'meta-externalagent': { action: 'license' },
      googlebot: { action: 'allow' },
      applebot: { action: 'allow' },
    },
  };

  const { key, hash, prefix } = generateSiteKey();
  const site = (await query(
    `INSERT INTO sites (user_id, name, domain, key_hash, key_prefix, policy, notify_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [user.id, 'Example Press', 'example.com', hash, prefix, JSON.stringify(policy), EMAIL],
  )).rows[0];

  const actionFor = (id) => policy.rules[id]?.action ?? policy.defaultAction;

  const rows = [];
  const now = Date.now();
  for (let day = 29; day >= 0; day--) {
    // Crawl volume is bursty: a few quiet days, occasional heavy sweeps.
    const burst = Math.random() < 0.18 ? randomInt(120, 320) : randomInt(20, 90);
    for (let i = 0; i < burst; i++) {
      const botId = pick(MIX);
      const crawler = catalog.byId.get(botId);
      const [verification, method, reason] = verificationFor(crawler);
      let action = actionFor(botId);
      if (verification === 'spoofed') action = 'block';
      const ts = new Date(now - day * 86_400_000 - randomInt(0, 86_400_000));
      const path = PAGES[randomInt(0, PAGES.length)];
      const ip = `203.0.113.${randomInt(1, 254)}`;
      rows.push([
        site.id, ts.toISOString(), botId, crawler.name, crawler.operator, crawler.purpose,
        path, 'GET', 'example.com', null,
        `Mozilla/5.0 (compatible; ${crawler.name}/1.0)`, ip,
        verification, method, reason, action,
        policy.rules[botId] ? `rules.${botId}` : 'defaultAction',
        action === 'block' ? 403 : action === 'license' ? 403 : 200,
        createHash('sha256').update(`${site.id}|${ts.toISOString()}|${botId}|${path}|${ip}|GET`).digest('hex'),
      ]);
    }
  }

  const columns = 19;
  for (let offset = 0; offset < rows.length; offset += 200) {
    const chunk = rows.slice(offset, offset + 200);
    const values = chunk.flat();
    const tuples = chunk.map((_, index) =>
      `(${Array.from({ length: columns }, (__, i) => `$${index * columns + i + 1}`).join(',')})`);
    await query(
      `INSERT INTO bot_events
         (site_id, ts, bot_id, bot_name, operator, purpose, path, method, host, referrer,
          user_agent, client_ip, verification, verification_method, verification_reason,
          action, rule_source, response_status, fingerprint)
       VALUES ${tuples.join(',')} ON CONFLICT (fingerprint) DO NOTHING`,
      values,
    );
  }

  await query(
    `INSERT INTO licensing_inquiries
       (site_id, name, email, organization, intended_use, message, crawler_id, requested_path, status)
     VALUES
       ($1, 'Dana Okafor', 'dana@northwind-ai.example', 'Northwind AI', 'training',
        'We would like the full archive for pretraining, refreshed quarterly. What are your terms?',
        'claudebot', '/archive/2024/annual-review', 'new'),
       ($1, 'Sam Rivera', 'sam@retrieval.example', 'Retrieval Labs', 'rag',
        'Interested in live retrieval access for our assistant product, roughly 5k fetches a day.',
        'gptbot', '/blog/the-2026-report', 'contacted')`,
    [site.id],
  );

  console.log('\nSeeded.');
  console.log(`  dashboard login : ${EMAIL} / ${PASSWORD}`);
  console.log(`  site id         : ${site.id}`);
  console.log(`  site key        : ${key}`);
  console.log(`  events          : ${rows.length}`);
  console.log('\nThe site key is shown once. Put it in AICG_SITE_KEY for the example site.\n');
}

main()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exit(1);
  });
