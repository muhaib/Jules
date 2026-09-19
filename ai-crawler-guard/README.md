# AI Crawler Guard

See which AI crawlers are hitting your site, prove they are who they say they
are, and decide per crawler what each one gets: the page, a licensing landing
page, or a 403.

Built for site owners who are not on Cloudflare Enterprise and do not want to
become a CDN customer to answer the question "is GPTBot reading my archive?".

## What it is

Three pieces, and you can use the first on its own:

| Piece | What it does |
|---|---|
| **`ai-crawler-guard`** (npm) | Middleware you mount in your Express / Fastify / Next.js / `node:http` app. Detects, verifies, decides, logs, serves robots.txt, serves the licensing page. |
| **Aggregation API** (`apps/api`) | Receives batched hit events, stores the policy the middleware polls, captures licensing inquiries. Express + PostgreSQL. |
| **Dashboard** (`apps/dashboard`) | Next.js. Traffic by crawler and by page, identity-check breakdown, per-crawler allow/block/licence toggles, generated robots.txt, inquiry inbox. |

The middleware runs **inside your application**. Nothing routes through this
service and there is no DNS change. The hosted half is optional: without an API
key the middleware still detects, verifies, blocks and serves the licensing
page, and hands every event to a sink of your choosing.

### Why a package rather than a reverse proxy

A proxy would be language-agnostic and would apply config changes instantly.
It would also put a service you now operate in the critical path of every
request on the site, with TLS termination, certificates and an availability
story attached. For the problem this solves — visibility, plus a per-crawler
decision, plus a licensing lead funnel — that cost buys very little.

So the engine (`packages/core`) has no HTTP framework in it at all. It takes a
plain description of a request and returns a decision. Every adapter is a thin
translation over that, and `examples/reverse-proxy` is the same engine in front
of an origin in about sixty lines. Moving to a hosted proxy later is a
transport change, not a rewrite.

### What it deliberately does not do

**No payment processing, metering, or per-crawl billing.** A blocked crawler
can be shown a licensing page that captures an inquiry — a name, an email, a
stated use — which lands in the dashboard and, if SMTP is configured, the
owner's inbox. A human deal follows, or it does not. There is no checkout, no
price quote, no simulated transaction anywhere in this codebase.

## Quick start

```bash
cp .env.example .env            # set SESSION_SECRET: openssl rand -hex 32
docker compose up --build
docker compose exec api npm run seed -w @ai-crawler-guard/api
```

The seed prints a login and a site key. Open <http://localhost:3000>.

Without Docker:

```bash
createdb aicg
npm install
DATABASE_URL=postgres://localhost/aicg npm run migrate
DATABASE_URL=postgres://localhost/aicg npm run seed
DATABASE_URL=postgres://localhost/aicg SESSION_SECRET=$(openssl rand -hex 32) npm run dev:api
npm run dev:dashboard           # in another shell
npm start --prefix examples/express-site
```

## Using the middleware

```bash
npm install ai-crawler-guard
```

```js
import express from 'express';
import { createAiCrawlerGuard, configFromEnv } from 'ai-crawler-guard';

const guard = await createAiCrawlerGuard({
  ...configFromEnv(),            // AICG_API_URL / AICG_SITE_KEY, optional

  policy: {
    defaultAction: 'log',        // observe first, decide later
    onSpoofed: 'block',
    rules: {
      gptbot: 'block',
      ccbot: 'block',
      claudebot: { action: 'license' },
      googlebot: 'allow',
      'claude-user': { action: 'allow', paths: [{ match: '/premium/', action: 'license' }] },
    },
  },

  robots: { serve: true, existing: await readFile('public/robots.txt', 'utf8') },

  licensing: {
    publicUrl: 'https://example.com',
    branding: { siteName: 'Example Press', contactEmail: 'licensing@example.com' },
  },

  trustProxy: false,             // see "Behind a proxy" below - this matters
});

app.use(guard.express());
```

Other frameworks:

```js
await app.register(guard.fastify, guard.fastifyOptions);   // Fastify
const handled = await guard.node()(req, res);              // node:http
export default async (req) => (await guard.next()(req)) ?? undefined;  // Next.js
```

### Next.js runtime caveat

Next middleware runs on the Edge runtime by default, and `node:dns` does not
exist there, so reverse-DNS verification cannot run. Either opt in to the
Node.js runtime:

```js
export const config = { runtime: 'nodejs', matcher: '/:path*' };
```

…or accept that every check comes back `unknown` and set `onUnknown`
accordingly. The adapter degrades honestly: a missing resolver produces
`unknown`, never a false `verified`.

There is a second Next-specific trap. `NextRequest` no longer carries `.ip` in
Next 15, and middleware has no socket address, so with the default
`trustProxy: false` there is no address to verify and every check returns
`unknown`. Set `trustProxy` to match your hosting (Vercel puts the client in
`x-forwarded-for`), or pass your own extractor:

```js
guard.next({ ip: (request) => request.headers.get('x-real-ip') })
```

The guard reports this once through `onError` rather than failing quietly.

## The four actions

| Action | What the crawler gets |
|---|---|
| `allow` | The page. |
| `log` | The page, and the hit is recorded. The sensible starting point. |
| `license` | The licensing landing page instead of the content, with an inquiry form. |
| `block` | 403 and no content. |

Every AI-crawler hit is logged whichever action applies — the point of the tool
is knowing what is out there, not only what was stopped.

Precedence, most specific first:

1. A **per-crawler path rule** (`rules.claudebot.paths`) wins outright, and may
   loosen as well as tighten — "block ClaudeBot everywhere except `/press/`" is
   a legitimate policy.
2. The **crawler's own action** (`rules.claudebot.action`).
3. A **site-wide path rule** (`pathRules`), which can only make the outcome
   *stricter*. It says nothing about any particular crawler, so a generic
   `{ match: '/public/', action: 'allow' }` must not silently un-block a
   crawler you explicitly blocked.
4. The catalog's `defaultAction`, then the policy's `defaultAction`.

`/robots.txt`, `/.well-known/ai-licensing` and the inquiry endpoint are never
blocked, whatever the policy says and whether or not the middleware serves them
itself. The hit is still detected and logged; it just cannot be withheld.

## Verifying that a crawler is what it claims

A user-agent string is a claim. Anyone can send `GPTBot/1.2`. Two methods
verify the claim, in the order each crawler's catalog entry lists:

**Reverse DNS with forward confirmation** — the technique Google documents for
Googlebot. Reverse-resolve the connecting IP, check the PTR hostname is in the
operator's zone (anchored at a label boundary, so `notopenai.com` cannot match
`.openai.com`), then forward-resolve that hostname and confirm it points back
at the same IP. A spoofer controls their user-agent and their own DNS, but not
the operator's reverse zone.

```
203.0.113.7  →  PTR crawl-…​.crawl.example.com  →  A 203.0.113.7  ✓ verified
66.66.66.66  →  PTR crawl-…​.crawl.example.com  →  A 203.0.113.7  ✗ spoofed
```

**Published IP ranges** — for operators (OpenAI, Anthropic, Perplexity) who
publish a prefix list rather than PTR records. Static ranges in the catalog are
always used. Fetching the operator's live list is **off by default** and
enabled with `verification: { fetchRanges: true }`; a middleware should not
make outbound requests nobody asked for.

The result is three-valued, deliberately:

| Status | Meaning |
|---|---|
| `verified` | A method positively confirmed the claim. |
| `spoofed` | A method positively refuted it — no PTR, wrong zone, forward lookup elsewhere, IP outside the published ranges. |
| `unknown` | Nothing could answer right now: DNS timeout, ranges not loaded. **Not** the same as refuted. |
| `unverifiable` | The operator publishes no way to check at all. |

Treating `unknown` as `spoofed` would mean a flaky resolver starts blocking
real crawlers, so the policy never does that on its own. Unverified identity
only ever makes the outcome *stricter*, never looser: blocking something that
merely claims to be GPTBot is safe; granting it a privilege on an unchecked
header is not. Set `requireVerified: true` on a rule to withhold a permissive
action until identity is proven.

Lookups are cached per crawler and IP with status-specific TTLs, and
concurrent hits from one address collapse into a single lookup.

### Behind a proxy or a CDN

Every verification is about one IP address, so if the middleware inspects the
wrong one, nothing verifies. When your app sits behind a load balancer the
socket address is the proxy's, and you must say how to find the client:

```js
trustProxy: false                            // default: use the socket address
trustProxy: 2                                // exactly two proxies in front
trustProxy: ['10.0.0.0/8', '172.16.0.0/12']  // your proxies, by CIDR
trustProxy: true                             // leftmost X-Forwarded-For
```

`true` is only safe when an edge you control rewrites `X-Forwarded-For` on
every request. Otherwise any caller names their own IP and the check is
decorative.

## The crawler list is a file you own

`packages/core/crawlers.json` holds every signature: user-agent patterns, the
robots.txt token, the operator, what the crawler is for, and how to verify it.
Nothing is hardcoded in the engine.

```js
catalog: { source: '/etc/ai-crawler-guard/crawlers.json' }   // your file
catalog: { source: 'https://…/crawlers.json', refreshMs: 21600000 }  // hosted
```

When the hosted API is configured the middleware pulls the list from it, so a
signature update reaches deployed sites without a redeploy. If that fetch
fails the bundled list is used and the site still boots.

Crawlers with `"methods": []` have no published verification route. They are
detected and logged, and their identity is never confirmed. That number is
honest rather than flattering: inventing a hostname suffix to make it smaller
would block real crawlers.

Two entries — `Google-Extended` and `Applebot-Extended` — are marked
`robotsOnly`. They are opt-out controls that exist only in robots.txt and never
appear in a `User-Agent` header, so they show up in the generated file and in
the dashboard toggles, and are never matched against traffic.

## robots.txt

Generated from the same policy the middleware enforces, so the file and the
enforcement cannot drift apart. Serve it from the middleware
(`robots: { serve: true }`) and it regenerates from the live policy on every
request; your existing file is merged in rather than replaced.

```
# BEGIN ai-crawler-guard
User-agent: GPTBot
User-agent: Bytespider
User-agent: CCBot
Disallow: /

User-agent: ClaudeBot
Disallow: /premium/*
Allow: /
# END ai-crawler-guard
```

Crawlers with identical policy share one group. A partly-restricted crawler
gets its `Disallow` lines followed by `Allow: /`, which is correct under
RFC 9309 because the most specific rule wins, not the first one. Only the text
between the markers is replaced on regeneration; your own rules, and any
`Sitemap:` directive, survive.

robots.txt is a request, not a control — several documented AI crawlers ignore
it. That is exactly why the middleware enforces the same policy in-process.

## The licensing page

A crawler set to `license` gets a self-contained page instead of the content:
what was detected, what was requested, and a short form. Submitting it stores
an inquiry and, when SMTP is configured, emails the site owner. Storing is the
guarantee; email is best effort on top.

Reserved paths — `/robots.txt`, `/.well-known/ai-licensing` and the inquiry
endpoint — are always reachable, including by a crawler you are blocking. A bot
that cannot read robots.txt or reach the licensing page has no way to comply or
to get in touch.

`GET /.well-known/ai-licensing` with `Accept: application/json` returns a
machine-readable descriptor: contact address, inquiry URL, and the current
per-crawler policy.

## Logging and privacy

Events are queued in memory and shipped in batches. The reporter never throws
into your request path, never awaits network I/O in it, and drops the oldest
events (counting the drops) rather than growing without bound.

`logIp` chooses what is recorded: `store` (the address), `hash` (a salted
SHA-256 pseudonym, stable within a process lifetime unless you set `ipSalt`),
or `none`.

## Repository layout

```
packages/core        the engine: catalog, detection, verification, policy,
                     robots.txt, licensing page, log shipper. No framework.
packages/middleware  the npm package: Express / Fastify / Next / node:http
apps/api             aggregation API (Express 5 + PostgreSQL)
apps/dashboard       Next.js dashboard
examples/express-site   a demo site with the middleware mounted
examples/reverse-proxy  the same engine in front of an origin
```

## Tests

```bash
npm test                    # core + middleware + api
npm run test:core           # no database needed
npm run test:api            # needs PostgreSQL
TEST_DATABASE_URL=postgres://localhost/my_test npm run test:api
```

The API tests run against a real PostgreSQL database — they create the schema,
ingest events and assert on the aggregates. They default to `aicg_test` on
localhost and deliberately ignore `DATABASE_URL`: they truncate every table
between cases, and they refuse outright to run against a database whose name
does not end in `_test`.

DNS is faked in unit tests with an injected resolver, so the verification logic
is tested without the network — including the cases that matter most: a missing
PTR record, a hostname in someone else's zone, a hijacked reverse zone that
fails forward confirmation, and a resolver timeout that must come back
`unknown` rather than `spoofed`.

## Licence

MIT.
