/** Print palette, matching the on-screen design system. */
export const PDF = {
  ink: '#111827',
  muted: '#5A6474',
  faint: '#8A94A3',
  line: '#E2E7ED',
  raised: '#F4F6F8',
  accent: '#154A91',
  accentSoft: '#E8F0FA',
  ok: '#15803D',
  warn: '#B47908',
  bad: '#BE2C2C',
  crit: '#91183E',
  white: '#FFFFFF',
};

export const PAGE = {
  margin: 46,
  width: 595.28, // A4 portrait
  height: 841.89,
};

export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

export function scoreColor(score: number | null | undefined) {
  if (score === null || score === undefined) return PDF.muted;
  if (score >= 90) return PDF.ok;
  if (score >= 80) return PDF.accent;
  if (score >= 70) return PDF.warn;
  return PDF.bad;
}

export function severityColor(severity: string) {
  switch (severity) {
    case 'CRITICAL':
      return PDF.crit;
    case 'HIGH':
      return PDF.bad;
    case 'MEDIUM':
      return PDF.warn;
    default:
      return PDF.muted;
  }
}
