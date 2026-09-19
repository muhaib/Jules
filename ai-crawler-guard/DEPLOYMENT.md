# Deploying

Two things get deployed: the **API** (with PostgreSQL) and the **dashboard**.
The middleware ships inside the site owner's own application, so there is
nothing to deploy for it beyond `npm install` and two environment variables.

If you only want the middleware — detection, verification, blocking, the
licensing page, robots.txt — you do not need any of this. Give it a `sink`
function and skip the hosted half entirely.

## What the API needs

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | `postgres://user:pass@host:5432/db` |
| `SESSION_SECRET` | yes | ≥32 chars. `openssl rand -hex 32`. Rotating it signs everyone out. |
| `PORT` | no | Default `4000`. |
| `DASHBOARD_URL` | no | Used for CORS and for the link in notification email. |
| `CORS_ORIGINS` | no | Comma-separated exact origins. Not needed if the dashboard proxies the API (the default). |
| `ALLOW_REGISTRATION` | no | Set `false` after your accounts exist. |
| `MIGRATE_ON_BOOT` | no | `true` by default. Set `false` if you migrate in a deploy step. |
| `TRUST_PROXY` | no | `false`, `true`, a hop count, or CIDRs. Affects rate limiting only. |
| `CRAWLERS_FILE` | no | Path to your own signature list, overriding the bundled one. |
| `PGSSL` | no | `require` for managed Postgres that needs TLS. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | no | Without these, inquiries are stored and shown in the dashboard only, and the API says so once at boot. |

The dashboard needs one: `API_URL`, the address it reaches the API on.

## Migrations

Plain SQL in `apps/api/migrations`, applied in filename order and recorded in
`schema_migrations`. Each runs in a transaction; a failure rolls back and stops.

```bash
DATABASE_URL=… npm run migrate
```

On by default at boot. With more than one API replica, set
`MIGRATE_ON_BOOT=false` and run migrations as a release step so replicas do not
race.

## Docker

```bash
docker build -f apps/api/Dockerfile       -t aicg-api .          # from the repo root
docker build -f apps/dashboard/Dockerfile -t aicg-dashboard .
```

Both build from the repository root so the workspace packages resolve. The API
image has a `HEALTHCHECK` against `/health`; point your platform's health probe
at the same path.

`docker-compose.yml` brings up Postgres, the API and the dashboard together and
is the fastest way to see the whole thing running.

## Fly.io

```bash
fly launch --no-deploy --name your-aicg-api
fly postgres create --name your-aicg-db
fly postgres attach your-aicg-db          # sets DATABASE_URL
fly secrets set SESSION_SECRET=$(openssl rand -hex 32) \
               DASHBOARD_URL=https://your-aicg-dashboard.fly.dev
fly deploy --dockerfile apps/api/Dockerfile
```

`fly.toml` for the API:

```toml
app = "your-aicg-api"

[build]
  dockerfile = "apps/api/Dockerfile"

[http_service]
  internal_port = 4000
  force_https = true
  auto_stop_machines = "suspend"
  min_machines_running = 1

  [[http_service.checks]]
    path = "/health"
    interval = "15s"
    timeout = "2s"
```

Deploy the dashboard as a second app with `API_URL` set to the API's internal
address (`http://your-aicg-api.internal:4000`).

Keep `min_machines_running = 1` on the API. A suspended machine adds a cold
start to the middleware's policy poll, and the first ingest batch after a
scale-to-zero is the one most likely to time out and be retried.

## Railway / Render

Both read `Dockerfile` paths directly. Two services plus a managed Postgres:

- API: dockerfile `apps/api/Dockerfile`, health check `/health`, `DATABASE_URL`
  from the managed database, `PGSSL=require` if the provider requires TLS.
- Dashboard: dockerfile `apps/dashboard/Dockerfile`, `API_URL` set to the API's
  internal URL.

## A plain VPS

```bash
git clone … /srv/aicg && cd /srv/aicg
npm ci --omit=dev
npm run migrate
npm run build --prefix apps/dashboard
```

`/etc/systemd/system/aicg-api.service`:

```ini
[Unit]
Description=AI Crawler Guard API
After=network.target postgresql.service

[Service]
Type=simple
User=aicg
WorkingDirectory=/srv/aicg
EnvironmentFile=/etc/aicg/api.env
ExecStart=/usr/bin/node apps/api/src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/srv/aicg

[Install]
WantedBy=multi-user.target
```

A second unit runs `npx next start -p 3000` from `apps/dashboard`. Put nginx
in front of both, terminate TLS there, and proxy `/` to the dashboard.

The API closes its listener and drains the connection pool on `SIGTERM`, with a
ten-second hard stop, so `systemctl restart` does not cut requests short.

## Scaling notes, in the order they will bite you

**`bot_events` grows with your crawl volume, not your traffic.** A site that
gets 300 bot hits a day adds ~110k rows a year, which is nothing. A large
archive under a heavy sweep can add that in a week. Add retention before it
matters:

```sql
DELETE FROM bot_events WHERE ts < now() - interval '180 days';
```

Run it nightly from cron or `pg_cron`.

**The overview query scans the range you ask for.** It is indexed on
`(site_id, ts DESC)` and is fine into the low millions of rows per site. Past
that, add a daily rollup table and have the overview read the rollup for whole
days and the raw table only for today. Nothing in the API contract changes.

**The `/v1/ingest` limiter is per process.** It is in-memory, so with N
replicas the effective limit is N× what you configured. It exists to stop a
broken client, not to meter customers; for a real quota, move it to Redis.

**Ingest is idempotent.** Each event carries a content fingerprint with a
unique index, so a retried batch inserts nothing and the response says how many
were duplicates. Retries are safe.

## Security checklist before you point a real site at it

- [ ] `SESSION_SECRET` is random and not in version control.
- [ ] `ALLOW_REGISTRATION=false` once your accounts exist — otherwise the API is
      open to sign-ups.
- [ ] TLS in front of both services. The session cookie sets `Secure` when
      `NODE_ENV=production`, which means it will not be sent over plain HTTP.
- [ ] Postgres is not reachable from the internet.
- [ ] `TRUST_PROXY` matches your actual topology, on the API and in every site
      running the middleware.
- [ ] Site keys are in your deployment secret store. They are stored only as
      SHA-256 digests and cannot be recovered — rotate from the Install tab.

## Upgrading the crawler list without a redeploy

Sites configured with `AICG_API_URL` pull `/v1/crawlers` from the API and
refresh on an interval (six hours by default). To ship a signature update:

1. Edit `packages/core/crawlers.json`, or point `CRAWLERS_FILE` at your own copy.
2. Restart the API.
3. Deployed middleware picks it up on its next refresh.

An unreachable API does not break a site: the middleware keeps serving the last
policy and signature list it had, and falls back to the bundled list if it
never got one.
