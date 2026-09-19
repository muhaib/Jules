/**
 * Turning "who is this" into "what do we do".
 *
 * One policy object drives three things that must never disagree: the runtime
 * decision, the generated robots.txt, and what the dashboard shows. They are
 * all derived from this, so a toggle in the UI cannot drift from the file the
 * crawler actually reads.
 */
import { ConfigError } from './errors.js';

export const ACTIONS = /** @type {const} */ (['allow', 'log', 'license', 'block']);
const ACTION_SET = new Set(ACTIONS);

/**
 * How restrictive each action is. Used in one place only: a site-wide path
 * rule may make a crawler's outcome stricter, never looser. Without that, a
 * generic `{ match: '/public/', action: 'allow' }` would silently un-block a
 * crawler the owner had explicitly set to `block`.
 */
const SEVERITY = { allow: 0, log: 1, license: 2, block: 3 };

export const DEFAULT_POLICY = Object.freeze({
  defaultAction: 'log',
  onSpoofed: 'block',
  onUnknown: 'inherit',
  onUnverifiable: 'inherit',
  pathRules: [],
  rules: {},
});

function assertAction(value, path, { allowInherit = false } = {}) {
  if (allowInherit && value === 'inherit') return value;
  if (!ACTION_SET.has(value)) {
    throw new ConfigError(
      `expected one of ${ACTIONS.join(', ')}${allowInherit ? ', inherit' : ''}, got ${JSON.stringify(value)}`,
      { path },
    );
  }
  return value;
}

/**
 * Glob rules, kept small on purpose:
 *   `/admin`      exact path only
 *   `/admin/`     that path and everything under it
 *   `/blog/*`     one path segment ("/blog/post", not "/blog/2024/post")
 *   `/blog/**`    any depth
 *   `*.pdf`       suffix match within a segment
 */
export function globToRegExp(pattern) {
  if (typeof pattern !== 'string' || !pattern.length) {
    throw new ConfigError(`path pattern must be a non-empty string, got ${JSON.stringify(pattern)}`);
  }
  if (!pattern.includes('*') && pattern.endsWith('/')) {
    return new RegExp(`^${escapeRe(pattern)}`);
  }
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '[^/]';
    } else {
      out += escapeRe(char);
    }
  }
  return new RegExp(`${out}$`);
}

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePathRules(rules, path) {
  if (!rules) return [];
  if (!Array.isArray(rules)) throw new ConfigError('path rules must be an array', { path });
  return rules.map((rule, index) => {
    if (!rule || typeof rule !== 'object') {
      throw new ConfigError('each path rule must be an object with `match` and `action`', {
        path: `${path}[${index}]`,
      });
    }
    return {
      match: rule.match,
      regex: globToRegExp(rule.match),
      action: assertAction(rule.action, `${path}[${index}].action`),
    };
  });
}

function normalizeRule(value, id) {
  const raw = typeof value === 'string' ? { action: value } : value ?? {};
  if (typeof raw !== 'object') throw new ConfigError('rule must be a string or object', { path: `rules.${id}` });
  const rule = {
    action: raw.action === undefined ? null : assertAction(raw.action, `rules.${id}.action`),
    requireVerified: raw.requireVerified === true,
    unverifiedAction: raw.unverifiedAction === undefined
      ? null
      : assertAction(raw.unverifiedAction, `rules.${id}.unverifiedAction`),
    paths: compilePathRules(raw.paths, `rules.${id}.paths`),
  };
  if (rule.action === null && !rule.paths.length && !rule.requireVerified) {
    throw new ConfigError('rule sets nothing; give it an `action`, `paths`, or `requireVerified`', {
      path: `rules.${id}`,
    });
  }
  return rule;
}

export function createPolicy(config = {}, { catalog, ignoreUnknownRules = false, onUnknownRule } = {}) {
  const merged = { ...DEFAULT_POLICY, ...config };
  const policy = {
    defaultAction: assertAction(merged.defaultAction, 'defaultAction'),
    onSpoofed: assertAction(merged.onSpoofed, 'onSpoofed'),
    onUnknown: assertAction(merged.onUnknown, 'onUnknown', { allowInherit: true }),
    onUnverifiable: assertAction(merged.onUnverifiable, 'onUnverifiable', { allowInherit: true }),
    pathRules: compilePathRules(merged.pathRules, 'pathRules'),
    rules: {},
  };

  for (const [id, value] of Object.entries(merged.rules ?? {})) {
    if (catalog && !catalog.byId.has(id)) {
      // Strict on the way in, forgiving on the way out. Rejecting a rule the
      // owner is writing is helpful; refusing to load a policy that was valid
      // when it was saved, because a crawler has since left the catalog,
      // would take the whole site's policy offline over a stale key.
      if (ignoreUnknownRules) {
        onUnknownRule?.(id);
        continue;
      }
      throw new ConfigError(
        `no crawler with id ${JSON.stringify(id)} in the catalog; add it to crawlers.json first`,
        { path: `rules.${id}` },
      );
    }
    policy.rules[id] = normalizeRule(value, id);
  }

  function matchPath(rules, pathname) {
    for (const rule of rules) {
      if (rule.regex.test(pathname)) return rule;
    }
    return null;
  }

  /**
   * @param {{crawler: object, verification: {status: string}, pathname: string}} input
   * @returns {{action: string, reason: string, source: string, matchedPath: string|null}}
   */
  function resolve({ crawler, verification, pathname = '/' }) {
    const status = verification?.status ?? 'unknown';
    if (status === 'spoofed') {
      return {
        action: policy.onSpoofed,
        reason: `user-agent claims ${crawler.name} but verification refuted it (${verification?.reason ?? 'unknown'})`,
        source: 'onSpoofed',
        matchedPath: null,
      };
    }

    const rule = policy.rules[crawler.id];
    let action = null;
    let source = null;
    let matchedPath = null;

    // A per-crawler path rule is an explicit statement about this crawler on
    // this path, so it wins outright and may loosen as well as tighten
    // ("block ClaudeBot, except /press/").
    const botPath = rule ? matchPath(rule.paths, pathname) : null;
    if (botPath) {
      action = botPath.action;
      source = `rules.${crawler.id}.paths`;
      matchedPath = botPath.match;
    } else {
      if (rule?.action) {
        action = rule.action;
        source = `rules.${crawler.id}`;
      } else if (crawler.defaultAction) {
        action = crawler.defaultAction;
        source = 'catalog.defaultAction';
      } else {
        action = policy.defaultAction;
        source = 'defaultAction';
      }
      // A site-wide path rule says nothing about this crawler specifically,
      // so it can only tighten what the crawler's own rule already decided.
      const globalPath = matchPath(policy.pathRules, pathname);
      if (globalPath && SEVERITY[globalPath.action] > SEVERITY[action]) {
        action = globalPath.action;
        source = 'pathRules';
        matchedPath = globalPath.match;
      }
    }

    if (status === 'verified') {
      return { action, reason: `verified ${crawler.name}`, source, matchedPath };
    }

    // Unverified identity only ever makes the outcome stricter, never looser.
    // Blocking something that merely claims to be GPTBot is safe; granting it
    // a privilege on the strength of an unchecked header is not.
    const fallback = status === 'unverifiable' ? policy.onUnverifiable : policy.onUnknown;
    if (rule?.requireVerified) {
      const strict = rule.unverifiedAction ?? (fallback === 'inherit' ? 'block' : fallback);
      if (strict !== action) {
        return {
          action: strict,
          reason: `${crawler.name} requires a verified identity; verification returned ${status} (${verification?.reason ?? 'n/a'})`,
          source: `rules.${crawler.id}.requireVerified`,
          matchedPath,
        };
      }
    }
    if (fallback !== 'inherit' && fallback !== action) {
      return {
        action: fallback,
        reason: `verification returned ${status} (${verification?.reason ?? 'n/a'})`,
        source: status === 'unverifiable' ? 'onUnverifiable' : 'onUnknown',
        matchedPath,
      };
    }
    return {
      action,
      reason: `${crawler.name} identity ${status} (${verification?.reason ?? 'n/a'})`,
      source,
      matchedPath,
    };
  }

  /** Serialisable form - what the API stores and the dashboard edits. */
  function toJSON() {
    return {
      defaultAction: policy.defaultAction,
      onSpoofed: policy.onSpoofed,
      onUnknown: policy.onUnknown,
      onUnverifiable: policy.onUnverifiable,
      pathRules: policy.pathRules.map((r) => ({ match: r.match, action: r.action })),
      rules: Object.fromEntries(
        Object.entries(policy.rules).map(([id, rule]) => [
          id,
          {
            ...(rule.action ? { action: rule.action } : {}),
            ...(rule.requireVerified ? { requireVerified: true } : {}),
            ...(rule.unverifiedAction ? { unverifiedAction: rule.unverifiedAction } : {}),
            ...(rule.paths.length
              ? { paths: rule.paths.map((p) => ({ match: p.match, action: p.action })) }
              : {}),
          },
        ]),
      ),
    };
  }

  /**
   * The site-wide action for a crawler, ignoring request context. This is what
   * robots.txt generation and the dashboard toggles work from.
   */
  function actionFor(crawler) {
    const rule = policy.rules[crawler.id];
    if (rule?.action) return rule.action;
    if (crawler.defaultAction) return crawler.defaultAction;
    return policy.defaultAction;
  }

  function pathRulesFor(crawler) {
    const rule = policy.rules[crawler.id];
    return [...(rule?.paths ?? []), ...policy.pathRules].map((p) => ({ match: p.match, action: p.action }));
  }

  return { resolve, toJSON, actionFor, pathRulesFor, config: policy };
}
