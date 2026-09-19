import { compileCatalog } from '../src/catalog.js';

/** A tiny catalog so tests do not depend on the shipped signature list. */
export function testCatalog(overrides = {}) {
  return compileCatalog({
    version: 'test',
    crawlers: [
      {
        id: 'dnsbot',
        name: 'DnsBot',
        operator: 'Example',
        purpose: 'training',
        robotsToken: 'DnsBot',
        userAgentPatterns: ['DnsBot'],
        verification: { methods: ['dns'], hostnameSuffixes: ['.crawl.example.com'] },
      },
      {
        id: 'cidrbot',
        name: 'CidrBot',
        operator: 'Example',
        purpose: 'search',
        robotsToken: 'CidrBot',
        userAgentPatterns: ['CidrBot'],
        verification: { methods: ['cidr'], ranges: ['198.51.100.0/24', '2001:db8:1::/48'] },
      },
      {
        id: 'openbot',
        name: 'OpenBot',
        operator: 'Example',
        purpose: 'other',
        robotsToken: 'OpenBot',
        userAgentPatterns: ['OpenBot', 're:open-?bot/\\d'],
        verification: { methods: [] },
      },
      {
        id: 'robots-only',
        name: 'Example-Extended',
        operator: 'Example',
        purpose: 'training',
        robotsToken: 'Example-Extended',
        robotsOnly: true,
        verification: { methods: [] },
      },
    ],
    ...overrides,
  });
}

/** A DNS resolver double. `ptr` maps IP -> hostnames, `a` maps hostname -> IPs. */
export function fakeResolver({ ptr = {}, a = {}, aaaa = {}, fail = {} } = {}) {
  const calls = { reverse: 0, resolve4: 0, resolve6: 0 };
  const err = (code) => {
    const error = new Error(code);
    error.code = code;
    throw error;
  };
  return {
    calls,
    async reverse(ip) {
      calls.reverse++;
      if (fail.reverse) err(fail.reverse);
      if (!(ip in ptr)) err('ENOTFOUND');
      return ptr[ip];
    },
    async resolve4(hostname) {
      calls.resolve4++;
      if (fail.resolve4) err(fail.resolve4);
      if (!(hostname in a)) err('ENOTFOUND');
      return a[hostname];
    },
    async resolve6(hostname) {
      calls.resolve6++;
      if (fail.resolve6) err(fail.resolve6);
      if (!(hostname in aaaa)) err('ENOTFOUND');
      return aaaa[hostname];
    },
  };
}
