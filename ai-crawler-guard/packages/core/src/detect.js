/**
 * User-agent matching against the catalog.
 *
 * This is the cheap half of the job: a UA string is a claim, not evidence.
 * A match here only means "this request says it is GPTBot"; verify.js decides
 * whether to believe it.
 */

/**
 * @param {string} userAgent
 * @param {ReturnType<import('./catalog.js').compileCatalog>} catalog
 * @returns {{crawler: object, pattern: string}[]} every signature that matched
 */
export function detectAll(userAgent, catalog) {
  if (typeof userAgent !== 'string' || !userAgent.length) return [];
  const lower = userAgent.toLowerCase();
  const matches = [];
  for (const crawler of catalog.matchable) {
    let best = null;
    for (const pattern of crawler.patterns) {
      const hit = pattern.kind === 'substring' ? pattern.test(lower) : pattern.test(userAgent);
      if (hit && (!best || pattern.weight > best.weight)) best = pattern;
    }
    if (best) matches.push({ crawler, pattern: best.raw, weight: best.weight });
  }
  // Most specific signature wins: "Claude-SearchBot" beats "ClaudeBot".
  return matches.sort((a, b) => b.weight - a.weight);
}

/**
 * @returns {{crawler: object, pattern: string, alsoMatched: string[]} | null}
 */
export function detect(userAgent, catalog) {
  const matches = detectAll(userAgent, catalog);
  if (!matches.length) return null;
  const [winner, ...rest] = matches;
  return {
    crawler: winner.crawler,
    pattern: winner.pattern,
    alsoMatched: rest.map((m) => m.crawler.id),
  };
}
