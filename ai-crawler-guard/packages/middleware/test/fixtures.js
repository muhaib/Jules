import { createServer, Server } from 'node:http';

export const CATALOG = {
  version: 'test',
  crawlers: [
    {
      id: 'dnsbot', name: 'DnsBot', operator: 'Example', purpose: 'training',
      robotsToken: 'DnsBot', userAgentPatterns: ['DnsBot'],
      verification: { methods: ['dns'], hostnameSuffixes: ['.crawl.example.com'] },
    },
    {
      id: 'goodbot', name: 'GoodBot', operator: 'Example', purpose: 'search',
      robotsToken: 'GoodBot', userAgentPatterns: ['GoodBot'],
      verification: { methods: [] },
    },
  ],
};

/** Every IP resolves as a valid DnsBot, so tests can focus on the adapter. */
export const alwaysVerified = {
  async reverse(ip) { return [`host.crawl.example.com`]; },
  async resolve4() { return ['127.0.0.1']; },
  async resolve6() { return ['::1']; },
};

export const guardOptions = (extra = {}) => ({
  siteId: 'site_test',
  catalog: { source: CATALOG },
  verification: { resolver: alwaysVerified },
  reporting: false,
  robots: { serve: true, existing: 'User-agent: *\nDisallow: /admin/\n' },
  policy: { defaultAction: 'allow', rules: { dnsbot: 'block' } },
  licensing: { publicUrl: 'http://127.0.0.1', onInquiry: async () => {} },
  ...extra,
});

export async function listen(handler) {
  const server = handler instanceof Server ? handler : createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
