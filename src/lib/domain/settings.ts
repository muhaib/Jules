import 'server-only';

import type { Severity } from '@prisma/client';

import { prisma } from '@/lib/db';
import { DEFAULT_SCORING, type ScoringConfig } from '@/lib/domain/scoring';
import { DEFAULT_SEVERITY_COLORS, DEFAULT_SEVERITY_HOURS } from '@/lib/domain/deadlines';

export type OrgConfig = ScoringConfig & {
  recurrenceThreshold: number;
  recurrenceWindowDays: number;
  dueSoonHours: number;
  requirePhotoOnNonCompliance: boolean;
  escalateToBranchManager: boolean;
  escalateToRegionalManager: boolean;
  escalateToHeadOffice: boolean;
  severity: Record<Severity, { dueHours: number; escalateEveryHours: number; colorHex: string }>;
};

const FALLBACK_SEVERITY = Object.fromEntries(
  (Object.keys(DEFAULT_SEVERITY_HOURS) as Severity[]).map((s) => [
    s,
    {
      dueHours: DEFAULT_SEVERITY_HOURS[s],
      escalateEveryHours: 24,
      colorHex: DEFAULT_SEVERITY_COLORS[s],
    },
  ]),
) as OrgConfig['severity'];

/**
 * Resolves the organization's configuration, falling back to product defaults so
 * a missing settings row can never break scoring or deadline calculation.
 */
export async function orgConfig(organizationId: string): Promise<OrgConfig> {
  const [settings, policies] = await Promise.all([
    prisma.organizationSettings.findUnique({ where: { organizationId } }),
    prisma.severityPolicy.findMany({ where: { organizationId } }),
  ]);

  const severity = { ...FALLBACK_SEVERITY };
  for (const p of policies) {
    severity[p.severity] = {
      dueHours: p.dueHours,
      escalateEveryHours: p.escalateEveryHours,
      colorHex: p.colorHex,
    };
  }

  return {
    scoreCompliant: settings?.scoreCompliant ?? DEFAULT_SCORING.scoreCompliant,
    scorePartial: settings?.scorePartial ?? DEFAULT_SCORING.scorePartial,
    scoreNonCompliant: settings?.scoreNonCompliant ?? DEFAULT_SCORING.scoreNonCompliant,
    bandExcellent: settings?.bandExcellent ?? DEFAULT_SCORING.bandExcellent,
    bandGood: settings?.bandGood ?? DEFAULT_SCORING.bandGood,
    bandNeedsWork: settings?.bandNeedsWork ?? DEFAULT_SCORING.bandNeedsWork,
    recurrenceThreshold: settings?.recurrenceThreshold ?? 2,
    recurrenceWindowDays: settings?.recurrenceWindowDays ?? 365,
    dueSoonHours: settings?.dueSoonHours ?? 48,
    requirePhotoOnNonCompliance: settings?.requirePhotoOnNonCompliance ?? true,
    escalateToBranchManager: settings?.escalateToBranchManager ?? true,
    escalateToRegionalManager: settings?.escalateToRegionalManager ?? true,
    escalateToHeadOffice: settings?.escalateToHeadOffice ?? true,
    severity,
  };
}
