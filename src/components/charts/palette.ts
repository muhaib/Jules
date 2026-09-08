/**
 * One chart palette for the whole product.
 *
 * Categorical hues are distinguishable without relying on hue alone (they also
 * differ in lightness), and status colours are reused verbatim from the badge
 * system so a red bar and a red badge always mean the same thing.
 */
export const CHART = {
  accent: '#154A91',
  accentLight: '#5B8BC4',
  grid: '#E2E7ED',
  axis: '#8A94A3',
  label: '#5A6474',
  surface: '#FFFFFF',
};

export const STATUS_COLORS = {
  ok: '#15803D',
  warn: '#B47908',
  bad: '#BE2C2C',
  crit: '#91183E',
  info: '#1E64A0',
  neutral: '#8A94A3',
};

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#91183E',
  HIGH: '#BE2C2C',
  MEDIUM: '#B47908',
  LOW: '#8A94A3',
};

/** Categorical series colours, ordered for maximum separation at small sizes. */
export const SERIES = [
  '#154A91',
  '#B47908',
  '#15803D',
  '#8C4B9E',
  '#1E8FA8',
  '#BE2C2C',
  '#5A6474',
  '#6F7D2E',
];

export function scoreColor(score: number | null | undefined) {
  if (score === null || score === undefined) return STATUS_COLORS.neutral;
  if (score >= 90) return STATUS_COLORS.ok;
  if (score >= 80) return CHART.accent;
  if (score >= 70) return STATUS_COLORS.warn;
  return STATUS_COLORS.bad;
}
