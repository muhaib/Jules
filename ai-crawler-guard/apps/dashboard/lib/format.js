export const nf = new Intl.NumberFormat('en-US');

export function compact(value) {
  const number = Number(value ?? 0);
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 10_000) return `${Math.round(number / 1000)}k`;
  if (Math.abs(number) >= 1_000) return `${(number / 1000).toFixed(1)}k`;
  return nf.format(number);
}

export function relativeTime(value) {
  if (!value) return '-';
  const then = new Date(value).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function shortDate(value) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const ACTION_LABELS = {
  allow: 'Allowed',
  log: 'Logged only',
  license: 'Licensing page',
  block: 'Blocked',
};

export const ACTION_HELP = {
  allow: 'The crawler gets the page. Nothing is withheld.',
  log: 'The crawler gets the page, and every hit is recorded. Start here.',
  license: 'The crawler gets the licensing landing page instead of the content, and can send an inquiry.',
  block: 'The crawler gets a 403 and no content.',
};

export const PURPOSE_LABELS = {
  training: 'Training',
  search: 'Search',
  'user-fetch': 'User fetch',
  other: 'Other',
};

export const VERIFICATION_LABELS = {
  verified: 'Verified',
  unknown: 'Unconfirmed',
  unverifiable: 'No method',
  spoofed: 'Spoofed',
};
