import type { ResponseResult, Severity } from '@prisma/client';

export type ScoringConfig = {
  scoreCompliant: number;
  scorePartial: number;
  scoreNonCompliant: number;
  bandExcellent: number;
  bandGood: number;
  bandNeedsWork: number;
};

export const DEFAULT_SCORING: ScoringConfig = {
  scoreCompliant: 100,
  scorePartial: 50,
  scoreNonCompliant: 0,
  bandExcellent: 90,
  bandGood: 80,
  bandNeedsWork: 70,
};

/** Fraction of an item's weight earned by a given answer, or null when excluded. */
export function creditFor(result: ResponseResult, cfg: ScoringConfig): number | null {
  switch (result) {
    case 'COMPLIANT':
      return cfg.scoreCompliant / 100;
    case 'PARTIALLY_COMPLIANT':
      return cfg.scorePartial / 100;
    case 'NON_COMPLIANT':
      return cfg.scoreNonCompliant / 100;
    case 'NOT_APPLICABLE':
      // Excluded from both numerator and denominator.
      return null;
  }
}

export type ScoredResponse = {
  categoryName: string;
  weight: number;
  result: ResponseResult | null;
};

export type CategoryScore = {
  name: string;
  score: number | null;
  earned: number;
  applicable: number;
  total: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  na: number;
};

export type ScoreResult = {
  score: number | null;
  earnedPoints: number;
  applicablePoints: number;
  totalItems: number;
  compliantCount: number;
  partialCount: number;
  nonCompliantCount: number;
  naCount: number;
  categories: CategoryScore[];
};

/**
 * Compliance Score = Earned Points / Applicable Points x 100.
 *
 * Weights let an organization make, say, a fire-safety item count for more than
 * a housekeeping one. N/A answers drop out of the denominator entirely, so a
 * branch is never penalised for equipment it does not have.
 */
export function computeScore(responses: ScoredResponse[], cfg: ScoringConfig): ScoreResult {
  const byCategory = new Map<string, CategoryScore>();

  let earned = 0;
  let applicable = 0;
  let compliant = 0;
  let partial = 0;
  let nonCompliant = 0;
  let na = 0;

  for (const r of responses) {
    let cat = byCategory.get(r.categoryName);
    if (!cat) {
      cat = {
        name: r.categoryName,
        score: null,
        earned: 0,
        applicable: 0,
        total: 0,
        compliant: 0,
        partial: 0,
        nonCompliant: 0,
        na: 0,
      };
      byCategory.set(r.categoryName, cat);
    }

    cat.total += 1;
    if (!r.result) continue;

    switch (r.result) {
      case 'COMPLIANT':
        compliant += 1;
        cat.compliant += 1;
        break;
      case 'PARTIALLY_COMPLIANT':
        partial += 1;
        cat.partial += 1;
        break;
      case 'NON_COMPLIANT':
        nonCompliant += 1;
        cat.nonCompliant += 1;
        break;
      case 'NOT_APPLICABLE':
        na += 1;
        cat.na += 1;
        break;
    }

    const credit = creditFor(r.result, cfg);
    if (credit === null) continue;

    const weight = r.weight > 0 ? r.weight : 1;
    earned += credit * weight;
    applicable += weight;
    cat.earned += credit * weight;
    cat.applicable += weight;
  }

  const categories = [...byCategory.values()].map((c) => ({
    ...c,
    score: c.applicable > 0 ? round1((c.earned / c.applicable) * 100) : null,
  }));

  return {
    score: applicable > 0 ? round1((earned / applicable) * 100) : null,
    earnedPoints: round2(earned),
    applicablePoints: round2(applicable),
    totalItems: responses.length,
    compliantCount: compliant,
    partialCount: partial,
    nonCompliantCount: nonCompliant,
    naCount: na,
    categories,
  };
}

export type Band = 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'POOR';

export function bandFor(score: number | null | undefined, cfg: ScoringConfig): Band | null {
  if (score === null || score === undefined) return null;
  if (score >= cfg.bandExcellent) return 'EXCELLENT';
  if (score >= cfg.bandGood) return 'GOOD';
  if (score >= cfg.bandNeedsWork) return 'NEEDS_IMPROVEMENT';
  return 'POOR';
}

export const BAND_LABELS: Record<Band, string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  NEEDS_IMPROVEMENT: 'Needs Improvement',
  POOR: 'Poor',
};

/** Severity a non-compliant answer defaults to, when the item does not set one. */
export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const SEVERITY_LABELS: Record<Severity, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const SEVERITY_DESCRIPTIONS: Record<Severity, string> = {
  CRITICAL: 'Immediate safety, security or business risk.',
  HIGH: 'Significant compliance or operational issue.',
  MEDIUM: 'Requires corrective action but is not immediately critical.',
  LOW: 'Minor deficiency or housekeeping issue.',
};

export const RESULT_LABELS: Record<ResponseResult, string> = {
  COMPLIANT: 'Compliant',
  PARTIALLY_COMPLIANT: 'Partially Compliant',
  NON_COMPLIANT: 'Non-Compliant',
  NOT_APPLICABLE: 'N/A',
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
