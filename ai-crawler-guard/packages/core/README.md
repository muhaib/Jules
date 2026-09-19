# @ai-crawler-guard/core

The engine behind [`ai-crawler-guard`](../middleware): crawler signatures,
identity verification, policy resolution, robots.txt generation, the licensing
page and the log shipper — with no HTTP framework in it.

Use this package directly if you are writing your own adapter, embedding the
decision logic somewhere unusual, or putting it in front of an origin instead
of inside one. Otherwise install `ai-crawler-guard`, which is this plus the
framework adapters.

```js
import { createGuard } from '@ai-crawler-guard/core';

const guard = await createGuard({ policy: { rules: { gptbot: 'block' } } });

const decision = await guard.inspect({
  method: 'GET',
  url: '/blog/post',
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2)' },
  socketIp: '203.0.113.7',
});

// decision.matched      → true
// decision.crawler.id   → 'gptbot'
// decision.verification → { status: 'spoofed', method: 'dns', reason: 'no_ptr_record', … }
// decision.action       → 'block'
// decision.response     → { status, headers, body } — write it and stop
```

`inspect` is the whole interface. Everything else — Express, Fastify, Next, a
reverse proxy — is a translation into that shape and back out of
`decision.response`.

## Also exported

| Export | For |
|---|---|
| `compileCatalog`, `CatalogStore` | loading and validating a signature file |
| `detect`, `detectAll` | user-agent matching on its own |
| `createVerifier`, `RangeStore` | reverse-DNS / CIDR verification on its own |
| `createPolicy` | policy resolution and its JSON round-trip |
| `buildRobotsTxt`, `mergeRobots` | robots.txt generation and merging |
| `renderLicensingPage`, `parseInquiry` | the licensing page and its form |
| `createReporter` | the batching, non-blocking event shipper |
| `resolveClientIp`, `cidrContains` | client-address resolution behind proxies |

See the [root README](../../README.md) for the full picture, and
`crawlers.json` for the signature list.
