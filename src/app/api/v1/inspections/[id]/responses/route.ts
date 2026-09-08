import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { loadEditableInspection } from '@/lib/domain/inspections';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';

type Ctx = { params: Promise<{ id: string }> };

const answerSchema = z.object({
  responseId: z.string().min(1),
  result: z.enum(['COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE']).nullable(),
  observation: z.string().max(4000).nullable().optional(),
  comment: z.string().max(4000).nullable().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  answeredAt: z.coerce.date().optional(),
});

const schema = z.object({ responses: z.array(answerSchema).min(1).max(500) });

/**
 * PATCH /api/v1/inspections/:id/responses
 *
 * Bulk upsert of answers. This is the endpoint the offline queue replays, so it
 * accepts a whole inspection's worth of answers in one request and is safe to
 * call repeatedly with the same payload.
 */
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireApi('inspection:conduct');
  const { id } = await ctx.params;
  const inspection = await loadEditableInspection(user, id);
  const body = await parseJson(req, schema);
  const meta = await requestMeta();

  const ids = body.responses.map((r) => r.responseId);
  const owned = await prisma.inspectionResponse.findMany({
    where: { id: { in: ids }, inspectionId: inspection.id },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((o) => o.id));

  const accepted = body.responses.filter((r) => ownedIds.has(r.responseId));

  await prisma.$transaction(async (tx) => {
    for (const r of accepted) {
      await tx.inspectionResponse.update({
        where: { id: r.responseId },
        data: {
          result: r.result,
          observation: r.observation ?? null,
          comment: r.comment ?? null,
          severity: r.severity ?? null,
          latitude: r.latitude ?? null,
          longitude: r.longitude ?? null,
          answeredAt: r.result ? (r.answeredAt ?? new Date()) : null,
        },
      });
    }

    // Answering anything moves the inspection out of ASSIGNED.
    if (inspection.status === 'ASSIGNED') {
      await tx.inspection.update({
        where: { id: inspection.id },
        data: { status: 'IN_PROGRESS', startedAt: inspection.startedAt ?? new Date() },
      });
    }

    await audit(
      user,
      {
        action: accepted.length > 1 ? 'inspection.synced' : 'inspection.response_saved',
        entityType: 'Inspection',
        entityId: inspection.id,
        summary: `Recorded ${accepted.length} response(s) on ${inspection.reference}`,
        ...meta,
      },
      tx,
    );
  });

  const answered = await prisma.inspectionResponse.count({
    where: { inspectionId: inspection.id, result: { not: null } },
  });

  return ok({
    accepted: accepted.length,
    rejected: body.responses.length - accepted.length,
    answeredItems: answered,
    totalItems: inspection.totalItems,
  });
});
