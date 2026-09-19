/**
 * robots.txt generation, derived from the same policy the middleware enforces.
 *
 * Two rules shape the output, both from RFC 9309:
 *  - Consecutive `User-agent:` lines share one group of directives, so bots
 *    with identical policy are emitted together instead of repeated.
 *  - Within a group the *most specific* matching rule wins, not the first one.
 *    That is why a partly-restricted crawler gets its `Disallow:` lines plus a
 *    closing `Allow: /`, rather than the other way round.
 *
 * Note that robots.txt is a request, not a control. Bytespider and friends are
 * documented as ignoring it - that is exactly why the middleware enforces the
 * same policy in-process.
 */

const MANAGED_BEGIN = '# BEGIN ai-crawler-guard';
const MANAGED_END = '# END ai-crawler-guard';

/** Directives that apply to the whole file regardless of where they appear. */
const NON_GROUP_DIRECTIVE = /^(sitemap|host)\s*:/i;

/** Our glob dialect -> the robots.txt path dialect. */
export function globToRobotsPath(pattern) {
  if (!pattern.includes('*')) {
    return pattern.endsWith('/') ? pattern : `${pattern}$`;
  }
  // robots.txt has a single wildcard that also crosses "/", so "**" and "*"
  // both collapse to "*". That makes "/blog/*" slightly broader in robots.txt
  // than in the middleware; the middleware is the authoritative enforcement.
  return pattern.replace(/\*\*/g, '*');
}

function directivesFor(action, pathRules, { licensingUrl }) {
  const lines = [];
  if (action === 'block') {
    lines.push('Disallow: /');
    return lines;
  }
  if (action === 'license') {
    if (licensingUrl) lines.push(`# content licensing: ${licensingUrl}`);
    lines.push('Disallow: /');
    return lines;
  }
  const restricted = pathRules.filter((rule) => rule.action === 'block' || rule.action === 'license');
  if (!restricted.length) {
    // An empty Disallow is the canonical "everything is allowed" group.
    lines.push('Disallow:');
    return lines;
  }
  for (const rule of restricted) {
    lines.push(`Disallow: ${globToRobotsPath(rule.match)}`);
  }
  lines.push('Allow: /');
  return lines;
}

/**
 * @param {object} args
 * @param {ReturnType<import('./catalog.js').compileCatalog>} args.catalog
 * @param {ReturnType<import('./policy.js').createPolicy>} args.policy
 * @param {string} [args.licensingUrl]
 * @param {string[]} [args.sitemaps]
 * @param {string|Date} [args.generatedAt]
 * @returns {string} the managed section only
 */
export function buildManagedSection({
  catalog,
  policy,
  licensingUrl = null,
  sitemaps = [],
  generatedAt = new Date(),
  includeComments = true,
}) {
  const stamp = typeof generatedAt === 'string' ? generatedAt : generatedAt.toISOString().slice(0, 10);

  /** @type {Map<string, {tokens: string[], lines: string[], actions: Set<string>}>} */
  const groups = new Map();
  for (const crawler of catalog.crawlers) {
    const action = policy.actionFor(crawler);
    const pathRules = policy.pathRulesFor(crawler);
    const lines = directivesFor(action, pathRules, { licensingUrl });
    const key = lines.join('\n');
    if (!groups.has(key)) groups.set(key, { tokens: [], lines, actions: new Set() });
    const group = groups.get(key);
    group.tokens.push(crawler.robotsToken);
    group.actions.add(action);
  }

  const out = [MANAGED_BEGIN];
  if (includeComments) {
    out.push(
      `# Generated from the bot policy on ${stamp} (catalog ${catalog.version}).`,
      '# Edit the policy, not this block - anything between the BEGIN/END',
      '# markers is replaced on the next generation.',
    );
  }
  for (const group of groups.values()) {
    out.push('');
    if (includeComments) {
      out.push(`# ${[...group.actions].join(' / ')}`);
    }
    for (const token of group.tokens) out.push(`User-agent: ${token}`);
    out.push(...group.lines);
  }
  for (const sitemap of sitemaps) {
    out.push('', `Sitemap: ${sitemap}`);
  }
  out.push(MANAGED_END);
  return `${out.join('\n')}\n`;
}

/**
 * Split an existing robots.txt into groups and everything else, so a merge can
 * drop only the groups we manage and leave the owner's own rules untouched.
 */
export function parseRobots(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const blocks = [];
  let current = null;
  let inManagedBlock = false;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === MANAGED_BEGIN) {
      flush();
      inManagedBlock = true;
      continue;
    }
    if (trimmed === MANAGED_END) {
      inManagedBlock = false;
      continue;
    }
    if (inManagedBlock) continue;

    const match = /^user-agent\s*:\s*(.+?)\s*$/i.exec(trimmed);
    if (match) {
      const token = match[1].split('#')[0].trim();
      if (!current || current.hasDirectives) {
        flush();
        current = { agents: [], lines: [], hasDirectives: false };
      }
      current.agents.push(token);
      continue;
    }
    if (current) {
      if (trimmed && !trimmed.startsWith('#')) current.hasDirectives = true;
      current.lines.push(line);
      continue;
    }
    blocks.push({ standalone: line });
  }
  flush();
  return blocks;
}

/**
 * Merge a managed section into an owner-supplied robots.txt.
 * Groups naming a token we manage are removed so the crawler sees exactly one
 * group for its token; everything else (their `User-agent: *` rules, Sitemap
 * lines, comments) is preserved verbatim.
 */
export function mergeRobots(existing, managedSection, managedTokens) {
  const managed = new Set(managedTokens.map((token) => token.toLowerCase()));
  const blocks = parseRobots(existing);
  const kept = [];

  for (const block of blocks) {
    if (block.standalone !== undefined) {
      kept.push(block.standalone);
      continue;
    }
    const survivors = block.agents.filter((agent) => !managed.has(agent.toLowerCase()));
    if (!survivors.length) {
      // Sitemap and Host are file-level directives, not part of any group.
      // They are only *positioned* inside one, so they must outlive it.
      kept.push(...block.lines.filter((line) => NON_GROUP_DIRECTIVE.test(line.trim())));
      continue;
    }
    for (const agent of survivors) kept.push(`User-agent: ${agent}`);
    kept.push(...block.lines);
  }

  const head = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return head ? `${head}\n\n${managedSection}` : managedSection;
}

/**
 * The whole file: the owner's robots.txt (if any) with our managed section
 * merged in.
 */
export function buildRobotsTxt({ catalog, policy, existing = '', ...options }) {
  const managedSection = buildManagedSection({ catalog, policy, ...options });
  const tokens = catalog.crawlers.map((crawler) => crawler.robotsToken);
  return mergeRobots(existing, managedSection, tokens);
}
