import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { inspectionScope, notFound, requireApi } from '@/lib/auth/guard';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/inspections/:id — the full inspection payload.
 *
 * This is what an inspector downloads for offline work, so it carries every
 * checklist item, existing answer and evidence count in one response.
 */
export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireApi('inspection:view');
  const { id } = await ctx.params;
  const scope = await inspectionScope(user);

  const inspection = await prisma.inspection.findFirst({
    where: { ...scope, id },
    include: {
      branch: { select: { id: true, name: true, code: true, city: true, address: true } },
      template: { select: { id: true, name: true } },
      inspector: { select: { id: true, name: true } },
      assignedBy: { select: { id: true, name: true } },
      responses: {
        orderBy: { position: 'asc' },
        include: {
          checklistItem: {
            select: { id: true, guidance: true, isMandatory: true, requirePhotoOnFail: true, defaultSeverity: true },
          },
          evidence: {
            select: { id: true, caption: true, kind: true, mimeType: true, capturedAt: true },
          },
        },
      },
    },
  });

  if (!inspection) throw notFound('Inspection not found');

  // Grouped by category — the shape both the runner and a mobile client want.
  const categories: {
    name: string;
    items: unknown[];
  }[] = [];
  for (const r of inspection.responses) {
    let cat = categories.find((c) => c.name === r.categoryName);
    if (!cat) {
      cat = { name: r.categoryName, items: [] };
      categories.push(cat);
    }
    cat.items.push({
      responseId: r.id,
      checklistItemId: r.checklistItemId,
      text: r.itemText,
      guidance: r.checklistItem.guidance,
      isMandatory: r.checklistItem.isMandatory,
      requirePhotoOnFail: r.checklistItem.requirePhotoOnFail,
      defaultSeverity: r.checklistItem.defaultSeverity,
      weight: r.weight,
      result: r.result,
      observation: r.observation,
      comment: r.comment,
      severity: r.severity,
      evidence: r.evidence,
      evidenceCount: r.evidence.length,
    });
  }

  return ok({
    data: {
      id: inspection.id,
      reference: inspection.reference,
      status: inspection.status,
      scheduledFor: inspection.scheduledFor,
      startedAt: inspection.startedAt,
      submittedAt: inspection.submittedAt,
      score: inspection.score,
      notes: inspection.notes,
      summary: inspection.summary,
      branch: inspection.branch,
      template: inspection.template,
      inspector: inspection.inspector,
      assignedBy: inspection.assignedBy,
      totalItems: inspection.totalItems,
      answeredItems: inspection.responses.filter((r) => r.result).length,
      categories,
    },
  });
});
