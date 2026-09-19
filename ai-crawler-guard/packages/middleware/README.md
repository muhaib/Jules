# ai-crawler-guard

Detect, verify, log and selectively block or licence AI crawlers, from inside
your own Node application.

```bash
npm install ai-crawler-guard
```

```js
import { createAiCrawlerGuard } from 'ai-crawler-guard';

const guard = await createAiCrawlerGuard({
  policy: { defaultAction: 'log', rules: { gptbot: 'block', claudebot: 'license' } },
  robots: { serve: true },
});

app.use(guard.express());
```

| Framework | Adapter |
|---|---|
| Express / Connect | `app.use(guard.express())` |
| Fastify | `await app.register(guard.fastify, guard.fastifyOptions)` |
| Next.js | `export default async (req) => (await guard.next()(req)) ?? undefined` |
| `node:http` | `if (await guard.node()(req, res)) return;` |

**Next.js:** set `export const config = { runtime: 'nodejs' }` in your
middleware. Reverse-DNS verification needs `node:dns`, which the Edge runtime
does not have; without it every identity check returns `unknown`.

Full documentation, including how verification works and why `trustProxy`
matters, is in the [root README](../../README.md).
