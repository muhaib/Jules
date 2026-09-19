import { apiGet } from '../../../../lib/api';
import { CopyButton } from '../../../../components/Chrome';
import { RotateKeyButton } from '../../../../components/RotateKeyButton';

export const dynamic = 'force-dynamic';

const ENV = (siteId) => `AICG_API_URL=https://your-api-host
AICG_SITE_KEY=aicg_live_...        # from this page
AICG_SITE_ID=${siteId}
AICG_TRUST_PROXY=false             # or a hop count, or your proxies' CIDRs
AICG_LOG_IP=store                  # store | hash | none`;

const EXPRESS = `import express from 'express';
import { createAiCrawlerGuard, configFromEnv } from 'ai-crawler-guard';

const app = express();

const guard = await createAiCrawlerGuard({
  ...configFromEnv(),
  robots: { serve: true, existing: await readFile('public/robots.txt', 'utf8') },
  licensing: {
    publicUrl: 'https://example.com',
    branding: { siteName: 'Example Press', contactEmail: 'licensing@example.com' },
  },
});

app.use(guard.express());`;

const NEXT = `// middleware.js
import { createAiCrawlerGuard, configFromEnv } from 'ai-crawler-guard';

// Reverse-DNS verification needs node:dns, which the Edge runtime does not
// have. Without this line every identity check comes back "unconfirmed".
export const config = { runtime: 'nodejs', matcher: '/:path*' };

const guard = await createAiCrawlerGuard({ ...configFromEnv(), robots: { serve: true } });
const handle = guard.next();

export default async function middleware(request) {
  return (await handle(request)) ?? undefined;
}`;

const FASTIFY = `import Fastify from 'fastify';
import { createAiCrawlerGuard, configFromEnv } from 'ai-crawler-guard';

const app = Fastify();
const guard = await createAiCrawlerGuard(configFromEnv());
await app.register(guard.fastify, guard.fastifyOptions);`;

export default async function InstallPage({ params }) {
  const { siteId } = await params;
  const { site } = await apiGet(`/api/sites/${siteId}`);

  return (
    <>
      <h1>Install</h1>
      <p className="sub">
        The middleware runs inside your app. Nothing routes through this service, and no
        DNS change is needed.
      </p>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Site key</h2>
            <p className="sub small" style={{ margin: 0 }}>
              Stored as a hash, so the full key cannot be shown again. Rotate it if it leaks.
            </p>
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <RotateKeyButton siteId={siteId} />
        </div>
        <pre className="code">{site.key_prefix}&hellip;</pre>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>1. Install</h2></div>
          <span className="spacer" style={{ flex: 1 }} />
          <CopyButton text="npm install ai-crawler-guard" />
        </div>
        <pre className="code">npm install ai-crawler-guard</pre>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>2. Environment</h2>
            <p className="sub small" style={{ margin: 0 }}>
              With these set, the middleware ships its logs here and polls this service
              for the policy you set on the Crawlers tab.
            </p>
          </div>
          <span className="spacer" style={{ flex: 1 }} />
          <CopyButton text={ENV(siteId)} />
        </div>
        <pre className="code">{ENV(siteId)}</pre>
      </div>

      <div className="card">
        <div className="card-head">
          <div><h2>3. Mount it</h2></div>
        </div>
        <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Express</h3>
        <pre className="code" style={{ marginBottom: 18 }}>{EXPRESS}</pre>
        <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Next.js</h3>
        <pre className="code" style={{ marginBottom: 18 }}>{NEXT}</pre>
        <h3 style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 6px' }}>Fastify</h3>
        <pre className="code">{FASTIFY}</pre>
      </div>

      <div className="card">
        <h2>Behind a proxy or CDN</h2>
        <p className="small" style={{ color: 'var(--text-secondary)' }}>
          Every identity check is made about one IP address. If your app sits behind a
          load balancer or CDN, the socket address is the proxy&rsquo;s, so you must tell the
          middleware how to find the real client &mdash; otherwise verification checks the
          wrong address and nothing verifies.
        </p>
        <p className="small" style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>
          Set <code>AICG_TRUST_PROXY</code> to the number of proxies in front of your app, or to
          a comma-separated list of their CIDRs. Leave it <code>false</code> if your app is
          directly exposed. Do not set it to <code>true</code> unless an edge you control
          rewrites <code>X-Forwarded-For</code> on every request &mdash; otherwise any caller can
          name their own IP and defeat the check.
        </p>
      </div>
    </>
  );
}
