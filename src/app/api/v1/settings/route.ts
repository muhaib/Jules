import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { badRequest, requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { orgConfig } from '@/lib/domain/settings';

export const GET = route(async () => {
  const user = await requireApi('settings:manage');
  return ok({ data: await orgConfig(user.organizationId) });
});

const schema = z.object({
  scoreCompliant: z.coerce.number().int().min(0).max(100),
  scorePartial: z.coerce.number().int().min(0).max(100),
  scoreNonCompliant: z.coerce.number().int().min(0).max(100),
  bandExcellent: z.coerce.number().int().min(1).max(100),
  bandGood: z.coerce.number().int().min(1).max(100),
  bandNeedsWork: z.coerce.number().int().min(1).max(100),
  dueSoonHours: z.coerce.number().int().min(1).max(720),
  recurrenceThreshold: z.coerce.number().int().min(2).max(20),
  recurrenceWindowDays: z.coerce.number().int().min(30).max(1825),
  requirePhotoOnNonCompliance: z.boolean(),
  escalateToBranchManager: z.boolean(),
  escalateToRegionalManager: z.boolean(),
  escalateToHeadOffice: z.boolean(),
  severity: z.object({
    CRITICAL: z.object({ dueHours: z.coerce.number().int().min(1).max(8760), escalateEveryHours: z.coerce.number().int().min(1).max(720) }),
    HIGH: z.object({ dueHours: z.coerce.number().int().min(1).max(8760), escalateEveryHours: z.coerce.number().int().min(1).max(720) }),
    MEDIUM: z.object({ dueHours: z.coerce.number().int().min(1).max(8760), escalateEveryHours: z.coerce.number().int().min(1).max(720) }),
    LOW: z.object({ dueHours: z.coerce.number().int().min(1).max(8760), escalateEveryHours: z.coerce.number().int().min(1).max(720) }),
  }),
});

export const PUT = route(async (req) => {
  const user = await requireApi('settings:manage');
  const body = await parseJson(req, schema);
  const meta = await requestMeta();
  const before = await orgConfig(user.organizationId);

  // Bands must descend, or the grade a score maps to becomes ambiguous.
  if (!(body.bandExcellent > body.bandGood && body.bandGood > body.bandNeedsWork)) {
    throw badRequest('Grade bands must descend: Excellent > Good > Needs Improvement');
  }
  if (body.scoreCompliant < body.scorePartial || body.scorePartial < body.scoreNonCompliant) {
    throw badRequest('Scoring weights must descend: Compliant ≥ Partial ≥ Non-compliant');
  }

  await prisma.$transaction(async (tx) => {
    await tx.organizationSettings.upsert({
      where: { organizationId: user.organizationId },
      create: { organizationId: user.organizationId, ...stripSeverity(body) },
      update: stripSeverity(body),
    });

    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
    for (const severity of severities) {
      const policy = body.severity[severity];
      await tx.severityPolicy.upsert({
        where: {
          organizationId_severity: { organizationId: user.organizationId, severity },
        },
        create: {
          organizationId: user.organizationId,
          severity,
          dueHours: policy.dueHours,
          escalateEveryHours: policy.escalateEveryHours,
          colorHex: before.severity[severity].colorHex,
        },
        update: { dueHours: policy.dueHours, escalateEveryHours: policy.escalateEveryHours },
      });
    }

    await audit(
      user,
      {
        action: 'settings.updated',
        entityType: 'OrganizationSettings',
        entityId: user.organizationId,
        summary: 'Updated scoring rules, deadlines and escalation settings',
        before,
        after: body,
        ...meta,
      },
      tx,
    );
  });

  return ok({ data: await orgConfig(user.organizationId) });
});

function stripSeverity(body: z.infer<typeof schema>) {
  const { severity: _severity, ...rest } = body;
  return rest;
}
