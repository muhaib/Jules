import 'server-only';

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { badRequest, forbidden, notFound } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { branchAudience, notify } from '@/lib/domain/notify';
import { orgConfig } from '@/lib/domain/settings';
import { computeScore, type ScoredResponse } from '@/lib/domain/scoring';
import { announceFinding, createFinding, nextInspectionReference } from '@/lib/domain/findings';
import { buildRecommendation } from '@/lib/domain/recommendation';

/**
 * Creates an inspection from a template, materialising one response row per
 * checklist item and snapshotting the template so later edits cannot alter this
 * inspection's questions.
 */
export async function assignInspection(
  actor: SessionUser,
  input: { branchId: string; templateId: string; inspectorId: string; scheduledFor: Date; notes?: string },
) {
  const template = await prisma.inspectionTemplate.findFirst({
    where: { id: input.templateId, organizationId: actor.organizationId },
    include: {
      categories: {
        where: { isActive: true },
        orderBy: { position: 'asc' },
        include: { items: { where: { isActive: true }, orderBy: { position: 'asc' } } },
      },
    },
  });
  if (!template) throw notFound('Template not found');

  const items = template.categories.flatMap((c) => c.items.map((i) => ({ category: c, item: i })));
  if (items.length === 0) throw badRequest('This template has no checklist items');

  const inspector = await prisma.user.findFirst({
    where: { id: input.inspectorId, organizationId: actor.organizationId, isActive: true },
  });
  if (!inspector) throw notFound('Inspector not found');

  const inspection = await prisma.$transaction(async (tx) => {
    const reference = await nextInspectionReference(actor.organizationId, tx);

    const created = await tx.inspection.create({
      data: {
        organizationId: actor.organizationId,
        reference,
        branchId: input.branchId,
        templateId: template.id,
        inspectorId: input.inspectorId,
        assignedById: actor.id,
        status: 'ASSIGNED',
        scheduledFor: input.scheduledFor,
        notes: input.notes ?? null,
        totalItems: items.length,
        templateSnapshot: {
          id: template.id,
          name: template.name,
          version: template.version,
          categories: template.categories.map((c) => ({
            id: c.id,
            name: c.name,
            position: c.position,
            weight: c.weight,
            items: c.items.map((i) => ({
              id: i.id,
              text: i.text,
              guidance: i.guidance,
              position: i.position,
              weight: i.weight,
              isMandatory: i.isMandatory,
              defaultSeverity: i.defaultSeverity,
              requirePhotoOnFail: i.requirePhotoOnFail,
            })),
          })),
        } as Prisma.InputJsonValue,
      },
    });

    await tx.inspectionResponse.createMany({
      data: items.map(({ category, item }) => ({
        inspectionId: created.id,
        checklistItemId: item.id,
        categoryName: category.name,
        itemText: item.text,
        position: category.position * 1000 + item.position,
        weight: item.weight,
      })),
    });

    await audit(
      actor,
      {
        action: 'inspection.assigned',
        entityType: 'Inspection',
        entityId: created.id,
        summary: `Assigned ${reference} to ${inspector.name}`,
        after: { branchId: input.branchId, inspectorId: input.inspectorId, scheduledFor: input.scheduledFor },
      },
      tx,
    );

    return created;
  });

  const branch = await prisma.branch.findUnique({
    where: { id: input.branchId },
    select: { name: true },
  });

  await notify({
    organizationId: actor.organizationId,
    userIds: [input.inspectorId],
    type: 'INSPECTION_ASSIGNED',
    title: `Inspection assigned: ${inspection.reference}`,
    body: `${branch?.name ?? 'Branch'} — scheduled for ${input.scheduledFor.toDateString()}.`,
    link: `/inspections/${inspection.id}`,
    entityType: 'Inspection',
    entityId: inspection.id,
  });

  return inspection;
}

/** Guards writes to an inspection: only the assigned inspector, and only before submission. */
export async function loadEditableInspection(actor: SessionUser, inspectionId: string) {
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, organizationId: actor.organizationId },
  });
  if (!inspection) throw notFound('Inspection not found');

  if (inspection.inspectorId !== actor.id && actor.role !== 'SUPER_ADMIN') {
    throw forbidden('Only the assigned inspector can edit this inspection');
  }
  if (inspection.status === 'SUBMITTED') {
    throw badRequest('This inspection has been submitted and can no longer be changed');
  }
  if (inspection.status === 'CANCELLED') {
    throw badRequest('This inspection has been cancelled');
  }
  return inspection;
}

export type SubmitResult = {
  score: number | null;
  findingsCreated: number;
  unanswered: number;
};

/**
 * Submits an inspection: validates mandatory coverage, computes the score,
 * locks the record, and raises a finding for every non-compliant answer.
 *
 * The whole thing runs in one transaction — an inspection can never end up
 * scored but without its findings, or vice versa.
 */
export async function submitInspection(
  actor: SessionUser,
  inspectionId: string,
  summary?: string,
): Promise<SubmitResult> {
  const cfg = await orgConfig(actor.organizationId);

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, organizationId: actor.organizationId },
    include: {
      responses: { include: { checklistItem: true, evidence: true }, orderBy: { position: 'asc' } },
      branch: { select: { id: true, name: true, managerId: true } },
    },
  });
  if (!inspection) throw notFound('Inspection not found');
  if (inspection.status === 'SUBMITTED') throw badRequest('This inspection is already submitted');
  if (inspection.inspectorId !== actor.id && actor.role !== 'SUPER_ADMIN') {
    throw forbidden('Only the assigned inspector can submit this inspection');
  }

  // Mandatory items must be answered — an inspection cannot be filed half-done.
  const missing = inspection.responses.filter((r) => r.checklistItem.isMandatory && !r.result);
  if (missing.length > 0) {
    throw badRequest(
      `${missing.length} mandatory item${missing.length === 1 ? '' : 's'} still unanswered: ` +
        missing
          .slice(0, 3)
          .map((m) => `"${m.itemText}"`)
          .join(', ') +
        (missing.length > 3 ? `, and ${missing.length - 3} more` : ''),
    );
  }

  // Non-compliance needs an observation, and (by policy) photo evidence.
  const failures = inspection.responses.filter((r) => r.result === 'NON_COMPLIANT');
  const withoutObservation = failures.filter((r) => !r.observation?.trim());
  if (withoutObservation.length > 0) {
    throw badRequest(
      `Every non-compliant item needs an observation. Missing on: "${withoutObservation[0].itemText}"`,
    );
  }
  if (cfg.requirePhotoOnNonCompliance) {
    const withoutPhoto = failures.filter(
      (r) => r.checklistItem.requirePhotoOnFail && r.evidence.length === 0,
    );
    if (withoutPhoto.length > 0) {
      throw badRequest(
        `Photo evidence is required for non-compliant items. Missing on: "${withoutPhoto[0].itemText}"`,
      );
    }
  }

  const scored: ScoredResponse[] = inspection.responses.map((r) => ({
    categoryName: r.categoryName,
    weight: r.weight,
    result: r.result,
  }));
  const score = computeScore(scored, cfg);

  const submittedAt = new Date();

  const findingIds = await prisma.$transaction(async (tx) => {
    await tx.inspection.update({
      where: { id: inspection.id },
      data: {
        status: 'SUBMITTED',
        submittedAt,
        score: score.score,
        earnedPoints: score.earnedPoints,
        applicablePoints: score.applicablePoints,
        totalItems: score.totalItems,
        compliantCount: score.compliantCount,
        partialCount: score.partialCount,
        nonCompliantCount: score.nonCompliantCount,
        naCount: score.naCount,
        categoryScores: score.categories as unknown as Prisma.InputJsonValue,
        summary: summary ?? buildRecommendation(score, failures.length),
      },
    });

    const ids: string[] = [];
    for (const response of failures) {
      // Guard against a re-submission ever duplicating findings.
      const existing = await tx.finding.findUnique({ where: { responseId: response.id } });
      if (existing) continue;

      const finding = await createFinding(
        actor,
        {
          organizationId: actor.organizationId,
          branchId: inspection.branchId,
          inspectionId: inspection.id,
          responseId: response.id,
          categoryName: response.categoryName,
          itemText: response.itemText,
          observation: response.observation ?? response.itemText,
          severity: response.severity ?? response.checklistItem.defaultSeverity,
        },
        cfg,
        tx,
      );

      // Inspection photos become the finding's "before" evidence.
      await tx.evidence.updateMany({
        where: { responseId: response.id },
        data: { findingId: finding.id, kind: 'BEFORE' },
      });

      ids.push(finding.id);
    }

    await audit(
      actor,
      {
        action: 'inspection.submitted',
        entityType: 'Inspection',
        entityId: inspection.id,
        summary: `Submitted ${inspection.reference} — score ${score.score ?? 0}%, ${ids.length} finding(s) raised`,
        after: {
          score: score.score,
          compliant: score.compliantCount,
          partial: score.partialCount,
          nonCompliant: score.nonCompliantCount,
          na: score.naCount,
        },
      },
      tx,
    );

    return ids;
  });

  // Notifications after commit: a failed email must never roll back an inspection.
  for (const id of findingIds) await announceFinding(id);

  const audience = await branchAudience(actor.organizationId, inspection.branchId, [
    'BRANCH_MANAGER',
    'REGIONAL_MANAGER',
    'VERIFIER',
  ]);
  await notify({
    organizationId: actor.organizationId,
    userIds: audience,
    type: 'INSPECTION_SUBMITTED',
    title: `Inspection submitted: ${inspection.reference}`,
    body: `${inspection.branch.name} scored ${score.score ?? 0}% with ${findingIds.length} finding(s).`,
    link: `/inspections/${inspection.id}`,
    entityType: 'Inspection',
    entityId: inspection.id,
  });

  return { score: score.score, findingsCreated: findingIds.length, unanswered: 0 };
}
