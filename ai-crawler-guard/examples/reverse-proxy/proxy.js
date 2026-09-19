/**
 * The proxy shape, in about sixty lines.
 *
 * This exists to keep an architectural promise honest: the detection engine
 * has no framework in it, so putting it in front of an origin instead of
 * inside one is a different transport, not a different product. Everything
 * that matters - signatures, reverse-DNS verification, policy, logging, the
 * licensing page, robots.txt - is the same code the npm package runs.
 *
 * What this is not: a production edge. There is no TLS termination, no
 * certificate management, no health checking, no connection pooling and no
 * HA story. Those are the real work of running a proxy service, and they are
 * the reason the package is the shipping product.
 *
 *   ORIGIN=http://localhost:8080 node proxy.js
 */
import http from 'node:http';
import { configFromEnv, createAiCrawlerGuard } from 'ai-crawler-guard';

const PORT = Number(process.env.PORT ?? 8000);
const ORIGIN = new URL(process.env.ORIGIN ?? 'http://localhost:8080');

const guard = await createAiCrawlerGuard({
  ...configFromEnv(),
  // The proxy is the only thing the client connects to, so the socket address
  // is the real client address and no forwarding header should be trusted.
  trustProxy: false,
  robots: { serve: true },
  licensing: { publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${PORT}` },
  reporting: process.env.AICG_SITE_KEY ? undefined : {
    sink: async (events) => events.forEach((e) => console.log('[bot]', e.botId, e.verification, e.action, e.path)),
    batchSize: 1,
    flushIntervalMs: 0,
  },
  onError: (error) => console.error('[guard]', error.message),
});

const handle = guard.node();

const server = http.createServer(async (req, res) => {
  // Decide before a single byte goes upstream. A blocked crawler costs the
  // origin nothing.
  if (await handle(req, res)) return;

  const upstream = http.request(
    {
      protocol: ORIGIN.protocol,
      hostname: ORIGIN.hostname,
      port: ORIGIN.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: ORIGIN.host,
        // Tell the origin who the client really is. The origin must be
        // configured to trust exactly this one hop.
        'x-forwarded-for': req.socket.remoteAddress,
        'x-forwarded-proto': 'http',
      },
    },
    (originResponse) => {
      res.writeHead(originResponse.statusCode, originResponse.headers);
      originResponse.pipe(res);
    },
  );

  upstream.on('error', (error) => {
    console.error('[proxy] upstream error:', error.message);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad gateway\n');
  });

  req.pipe(upstream);
});

server.listen(PORT, () => {
  console.log(`proxy on :${PORT} -> ${ORIGIN.origin}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    server.close();
    await guard.close();
    process.exit(0);
  });
}
