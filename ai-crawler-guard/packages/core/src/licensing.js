/**
 * The licensing landing page and the inquiry it captures.
 *
 * What this is: a page served instead of the content, explaining that the
 * content is available under licence, plus a form that turns a crawl attempt
 * into a lead in the owner's inbox.
 *
 * What this is deliberately not: a paywall, a metering system, or anything
 * that takes money. No payment is processed, quoted, or simulated anywhere in
 * this package. The output of this page is an email address and a stated
 * intent - a human deal follows, or it does not.
 */

const PURPOSE_LABELS = {
  training: 'model training',
  search: 'search indexing',
  'user-fetch': 'answering a user question',
  other: 'automated collection',
};

/**
 * The verification line is read by whoever operates the crawler, so it says
 * what happened in words rather than leaking an internal reason code.
 */
const VERIFICATION_TEXT = {
  verified: 'confirmed \u2014 this request really is from the operator it claims',
  spoofed: 'failed \u2014 this request claimed the crawler\u2019s name but the check refuted it',
  unknown: 'inconclusive \u2014 the check could not complete for this request',
  unverifiable: 'not available \u2014 this operator publishes no way to verify its crawler',
};

export const INTENDED_USES = [
  { value: 'training', label: 'Training or fine-tuning a model' },
  { value: 'rag', label: 'Retrieval / grounding at inference time' },
  { value: 'search', label: 'Search or answer-engine indexing' },
  { value: 'evaluation', label: 'Evaluation or benchmarking' },
  { value: 'archive', label: 'Archival or research corpus' },
  { value: 'other', label: 'Something else' },
];

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const DEFAULT_BRANDING = Object.freeze({
  siteName: null,
  contactEmail: null,
  headline: null,
  intro: null,
  termsUrl: null,
  accent: '#3d5afe',
});

function styles(accent) {
  return `
:root{color-scheme:light dark;--accent:${accent};--bg:#ffffff;--fg:#14161a;--muted:#5b6472;--line:#e3e7ee;--card:#f7f8fb;--field:#ffffff}
@media (prefers-color-scheme:dark){:root{--bg:#101215;--fg:#e9ecf1;--muted:#98a2b3;--line:#262b33;--card:#171a1f;--field:#1c2026}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:660px;margin:0 auto;padding:48px 16px 72px}
h1{font-size:1.75rem;line-height:1.25;margin:0 0 12px;letter-spacing:-0.02em}
h2{font-size:1rem;margin:32px 0 12px;letter-spacing:-0.01em}
p{margin:0 0 16px}
.lede{color:var(--muted)}
.meta{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:24px 0;font-size:.875rem}
.meta dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:0}
.meta dt{color:var(--muted)}
.meta dd{margin:0;font-variant-numeric:tabular-nums;word-break:break-word}
form{display:grid;gap:14px;margin-top:8px}
.row{display:grid;gap:14px}
@media(min-width:560px){.row{grid-template-columns:1fr 1fr}}
label{display:grid;gap:6px;font-size:.8125rem;color:var(--muted)}
input,select,textarea{font:inherit;font-size:.9375rem;color:var(--fg);background:var(--field);border:1px solid var(--line);border-radius:8px;padding:10px 12px;width:100%}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
textarea{min-height:110px;resize:vertical}
button{font:inherit;font-weight:600;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:12px 20px;cursor:pointer;justify-self:start}
button:hover{filter:brightness(1.08)}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
footer{margin-top:40px;padding-top:20px;border-top:1px solid var(--line);color:var(--muted);font-size:.8125rem}
a{color:var(--accent)}
.err{background:#fdecec;border:1px solid #f5b5b5;color:#8a1f1f;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:.875rem}
@media (prefers-color-scheme:dark){.err{background:#2a1518;border-color:#5a2b2b;color:#f2b8b8}}
`.trim();
}

function shell({ title, accent, body, noindex = true }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${noindex ? '<meta name="robots" content="noindex,nofollow">\n' : ''}<title>${escapeHtml(title)}</title>
<style>${styles(accent)}</style>
</head>
<body><div class="wrap">
${body}
</div></body>
</html>
`;
}

/**
 * @param {object} args
 * @param {object|null} args.crawler   matched catalog entry, if any
 * @param {object} args.branding
 * @param {string} args.inquiryPath    where the form posts
 * @param {string} args.pathname       the URL the crawler asked for
 * @param {string[]} [args.errors]     validation messages from a failed submit
 * @param {object} [args.values]       sticky form values after a failed submit
 */
export function renderLicensingPage({
  crawler = null,
  branding = {},
  inquiryPath,
  pathname = '/',
  verification = null,
  errors = [],
  values = {},
}) {
  const b = { ...DEFAULT_BRANDING, ...branding };
  const site = b.siteName ? escapeHtml(b.siteName) : 'This site';
  const botName = crawler ? escapeHtml(crawler.name) : 'Your crawler';
  const operator = crawler?.operator && crawler.operator !== 'Unknown' ? escapeHtml(crawler.operator) : null;
  const purpose = crawler ? PURPOSE_LABELS[crawler.purpose] ?? crawler.purpose : null;

  const headline = b.headline
    ? escapeHtml(b.headline)
    : `${site} licenses its content for AI use`;

  const intro = b.intro
    ? `<p class="lede">${escapeHtml(b.intro)}</p>`
    : `<p class="lede">${botName} requested this page${purpose ? ` for ${escapeHtml(purpose)}` : ''}, and automated access is not open by default here. The content is available under licence. Tell us what you need and the site owner will reply directly &mdash; this form sends an inquiry, nothing is charged and nothing is processed automatically.</p>`;

  const value = (name) => escapeHtml(values[name] ?? '');
  const selected = (name, option) => (values[name] === option ? ' selected' : '');

  const body = `
<h1>${headline}</h1>
${intro}

<div class="meta">
  <dl>
    <dt>Detected crawler</dt><dd>${botName}${operator ? ` &middot; ${operator}` : ''}</dd>
    <dt>Requested path</dt><dd>${escapeHtml(pathname)}</dd>
    ${verification ? `<dt>Identity check</dt><dd>${escapeHtml(VERIFICATION_TEXT[verification.status] ?? verification.status)}</dd>` : ''}
    <dt>Status</dt><dd>Access requires a licence</dd>
  </dl>
</div>

<h2>Request a licence</h2>
${errors.length ? `<div class="err"><strong>Please fix the following:</strong><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
<form method="post" action="${escapeHtml(inquiryPath)}">
  <input type="hidden" name="crawlerId" value="${escapeHtml(crawler?.id ?? '')}">
  <input type="hidden" name="requestedPath" value="${escapeHtml(pathname)}">
  <div class="hp" aria-hidden="true"><label>Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <div class="row">
    <label>Your name<input type="text" name="name" required autocomplete="name" value="${value('name')}"></label>
    <label>Work email<input type="email" name="email" required autocomplete="email" value="${value('email')}"></label>
  </div>
  <div class="row">
    <label>Organisation<input type="text" name="organization" autocomplete="organization" value="${value('organization')}"></label>
    <label>Intended use
      <select name="intendedUse">
        ${INTENDED_USES.map((use) => `<option value="${use.value}"${selected('intendedUse', use.value)}>${escapeHtml(use.label)}</option>`).join('\n        ')}
      </select>
    </label>
  </div>
  <label>What do you need access to, and at what volume?<textarea name="message" placeholder="e.g. full archive, refreshed monthly, roughly 40k pages">${value('message')}</textarea></label>
  <button type="submit">Send inquiry</button>
</form>

<footer>
  ${b.contactEmail ? `Prefer email? Write to <a href="mailto:${escapeHtml(b.contactEmail)}">${escapeHtml(b.contactEmail)}</a>.` : ''}
  ${b.termsUrl ? ` <a href="${escapeHtml(b.termsUrl)}">Licensing terms</a>.` : ''}
  ${crawler?.docs ? `<br>Crawler documentation: <a href="${escapeHtml(crawler.docs)}" rel="nofollow noopener">${escapeHtml(crawler.docs)}</a>` : ''}
</footer>`;

  return shell({ title: `${b.siteName ?? 'Content'} licensing`, accent: b.accent, body });
}

export function renderInquiryReceived({ branding = {} } = {}) {
  const b = { ...DEFAULT_BRANDING, ...branding };
  return shell({
    title: 'Inquiry received',
    accent: b.accent,
    body: `<h1>Inquiry received</h1>
<p class="lede">Thanks &mdash; your request has been passed to ${b.siteName ? escapeHtml(b.siteName) : 'the site owner'}, who will reply by email. No payment was taken and no account was created.</p>
${b.contactEmail ? `<p>If you need to follow up, write to <a href="mailto:${escapeHtml(b.contactEmail)}">${escapeHtml(b.contactEmail)}</a>.</p>` : ''}`,
  });
}

/** Machine-readable sibling of the landing page, for well-behaved agents. */
export function licensingDescriptor({ branding = {}, inquiryUrl, policySummary = [] }) {
  const b = { ...DEFAULT_BRANDING, ...branding };
  return {
    version: 1,
    site: b.siteName ?? null,
    statement: 'Automated access to this site is governed by a content licence. Payment is not handled here; submit an inquiry and a human will respond.',
    contactEmail: b.contactEmail ?? null,
    termsUrl: b.termsUrl ?? null,
    inquiryUrl,
    inquiryMethod: 'POST',
    inquiryFields: ['name', 'email', 'organization', 'intendedUse', 'message'],
    crawlers: policySummary,
  };
}

const MAX_FIELD = 2000;

/**
 * Validate and normalise a submitted inquiry.
 * @returns {{ok: true, value: object} | {ok: false, errors: string[], value: object}}
 */
export function parseInquiry(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const str = (key, max = 200) => {
    const value = input[key];
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, max);
  };

  const value = {
    name: str('name', 120),
    email: str('email', 254),
    organization: str('organization', 160),
    intendedUse: str('intendedUse', 40),
    message: str('message', MAX_FIELD),
    crawlerId: str('crawlerId', 64),
    requestedPath: str('requestedPath', 500),
  };

  const errors = [];
  if (!value.name) errors.push('A name is required.');
  if (!value.email) {
    errors.push('An email address is required.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) {
    errors.push('That email address does not look valid.');
  }
  if (value.intendedUse && !INTENDED_USES.some((use) => use.value === value.intendedUse)) {
    value.intendedUse = 'other';
  }
  if (!value.intendedUse) value.intendedUse = 'other';

  // Honeypot: a field hidden from people and irresistible to form spammers.
  if (str('website', 200)) {
    return { ok: false, errors: ['Submission rejected.'], value, spam: true };
  }

  if (errors.length) return { ok: false, errors, value };
  return { ok: true, value };
}
