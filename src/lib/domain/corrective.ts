import 'server-only';

import type { Severity } from '@prisma/client';

import { prisma } from '@/lib/db';
import { badRequest, forbidden, notFound } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { branchAudience, notify } from '@/lib/domain/notify';
import { orgConfig } from '@/lib/domain/settings';
import { assertTransition } from '@/lib/domain/findings';
import { dueDateFor } from '@/lib/domain/deadlines';

async function loadFinding(actor: SessionUser, findingId: string) {
  const finding = await prisma.finding.findFirst({
    where: { id: findingId, organizationId: actor.organizationId },
    include: {
      branch: { select: { id: true, name: true, managerId: true } },
      correctiveActions: { orderBy: { attempt: 'desc' }, take: 1 },
    },
  });
  if (!finding) throw notFound('Finding not found');
  return finding;
}

/** Assign a responsible person and (optionally) override the deadline. */
export async function assignFinding(
  actor: SessionUser,
  findingId: string,
  input: { assignedToId: string; dueDate?: Date; severity?: Severity; note?: string },
) {
  const finding = await loadFinding(actor, findingId);
  if (finding.status === 'CLOSED' || finding.status === 'CANCELLED') {
    throw badRequest('This finding is no longer open');
  }

  const assignee = await prisma.user.findFirst({
    where: { id: input.assignedToId, organizationId: actor.organizationId, isActive: true },
  });
  if (!assignee) throw notFound('The selected user could not be found');

  const cfg = await orgConfig(actor.organizationId);
  const severity = input.severity ?? finding.severity;
  // Changing severity re-bases the deadline off the new policy unless one is given.
  const dueDate =
    input.dueDate ??
    (input.severity && input.severity !== finding.severity
      ? dueDateFor(finding.createdAt, cfg.severity[severity].dueHours)
      : finding.dueDate);

  const nextStatus = finding.status === 'OPEN' ? 'ASSIGNED' : finding.status;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.finding.update({
      where: { id: finding.id },
      data: { assignedToId: input.assignedToId, dueDate, severity, status: nextStatus },
    });
    await audit(
      actor,
      {
        action: 'finding.assigned',
        entityType: 'Finding',
        entityId: finding.id,
        summary: `${finding.number} assigned to ${assignee.name}, due ${dueDate.toDateString()}`,
        before: { assignedToId: finding.assignedToId, dueDate: finding.dueDate, severity: finding.severity },
        after: { assignedToId: input.assignedToId, dueDate, severity },
      },
      tx,
    );
    return row;
  });

  await notify({
    organizationId: actor.organizationId,
    userIds: [input.assignedToId],
    type: 'FINDING_ASSIGNED',
    title: `Assigned to you: ${finding.number}`,
    body: `${finding.branch.name} — ${finding.itemText}. Due ${dueDate.toDateString()}.${
      input.note ? ` Note: ${input.note}` : ''
    }`,
    link: `/findings/${finding.id}`,
    entityType: 'Finding',
    entityId: finding.id,
  });

  return updated;
}

/** Branch manager acknowledges the finding and starts work. */
export async function startCorrectiveAction(actor: SessionUser, findingId: string, note?: string) {
  const finding = await loadFinding(actor, findingId);
  assertTransition(finding.status, 'IN_PROGRESS');

  return prisma.$transaction(async (tx) => {
    const row = await tx.finding.update({
      where: { id: finding.id },
      data: { status: 'IN_PROGRESS', startedAt: finding.startedAt ?? new Date() },
    });
    await audit(
      actor,
      {
        action: 'finding.started',
        entityType: 'Finding',
        entityId: finding.id,
        summary: `${finding.number} moved to In Progress${note ? ` — ${note}` : ''}`,
        before: { status: finding.status },
        after: { status: 'IN_PROGRESS' },
      },
      tx,
    );
    return row;
  });
}

/**
 * Submits a remediation attempt for verification. Each attempt is a new
 * CorrectiveAction row, so a rejection/rework cycle leaves a complete history
 * rather than overwriting the previous claim.
 */
export async function submitEvidence(
  actor: SessionUser,
  findingId: string,
  input: { description: string; actionTaken?: string; evidenceIds?: string[] },
) {
  const finding = await loadFinding(actor, findingId);

  if (finding.status === 'CLOSED' || finding.status === 'CANCELLED') {
    throw badRequest('This finding is already closed');
  }
  if (finding.assignedToId && finding.assignedToId !== actor.id && actor.role !== 'SUPER_ADMIN') {
    // Branch managers may still respond for their own branch.
    if (!(actor.role === 'BRANCH_MANAGER' && finding.branch.managerId === actor.id)) {
      throw forbidden('This finding is assigned to someone else');
    }
  }
  if (!input.description.trim()) throw badRequest('Describe the corrective action taken');

  const attempt = (finding.correctiveActions[0]?.attempt ?? 0) + 1;
  const now = new Date();

  const action = await prisma.$transaction(async (tx) => {
    const created = await tx.correctiveAction.create({
      data: {
        findingId: finding.id,
        attempt,
        description: input.description.trim(),
        actionTaken: input.actionTaken?.trim() || null,
        submittedById: actor.id,
        submittedAt: now,
        verdict: 'PENDING',
      },
    });

    // Attach the uploaded "after" evidence to this specific attempt.
    if (input.evidenceIds?.length) {
      await tx.evidence.updateMany({
        where: {
          id: { in: input.evidenceIds },
          organizationId: actor.organizationId,
          findingId: finding.id,
        },
        data: { correctiveActionId: created.id, kind: 'AFTER' },
      });
    }

    await tx.finding.update({
      where: { id: finding.id },
      data: { status: 'UNDER_VERIFICATION', evidenceSubmittedAt: now },
    });

    await audit(
      actor,
      {
        action: 'finding.evidence_submitted',
        entityType: 'Finding',
        entityId: finding.id,
        summary: `${finding.number}: corrective evidence submitted (attempt ${attempt})`,
        before: { status: finding.status },
        after: { status: 'UNDER_VERIFICATION', attempt },
      },
      tx,
    );

    return created;
  });

  const verifiers = await branchAudience(actor.organizationId, finding.branchId, [
    'VERIFIER',
    'REGIONAL_MANAGER',
  ]);
  await notify({
    organizationId: actor.organizationId,
    userIds: verifiers,
    type: 'EVIDENCE_SUBMITTED',
    title: `Awaiting verification: ${finding.number}`,
    body: `${finding.branch.name} — ${finding.itemText}. Attempt ${attempt} submitted by ${actor.name}.`,
    link: `/findings/${finding.id}`,
    entityType: 'Finding',
    entityId: finding.id,
  });

  return action;
}

/** Verifier accepts the evidence and closes the finding. */
export async function acceptEvidence(actor: SessionUser, findingId: string, comment?: string) {
  const finding = await loadFinding(actor, findingId);
  assertTransition(finding.status, 'CLOSED');

  const latest = finding.correctiveActions[0];
  if (!latest) throw badRequest('There is no submitted evidence to verify');

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.correctiveAction.update({
      where: { id: latest.id },
      data: {
        verdict: 'ACCEPTED',
        verifiedById: actor.id,
        verifiedAt: now,
        verifierComment: comment?.trim() || null,
      },
    });

    const row = await tx.finding.update({
      where: { id: finding.id },
      data: {
        status: 'CLOSED',
        closedAt: now,
        closedById: actor.id,
        closureNote: comment?.trim() || null,
      },
    });

    await audit(
      actor,
      {
        action: 'finding.evidence_accepted',
        entityType: 'Finding',
        entityId: finding.id,
        summary: `${finding.number} verified and closed by ${actor.name}`,
        before: { status: finding.status },
        after: { status: 'CLOSED', verifiedAt: now },
      },
      tx,
    );

    return row;
  });

  const audience = [
    ...(finding.assignedToId ? [finding.assignedToId] : []),
    ...(await branchAudience(actor.organizationId, finding.branchId, [
      'BRANCH_MANAGER',
      'REGIONAL_MANAGER',
    ])),
  ];
  await notify({
    organizationId: actor.organizationId,
    userIds: audience,
    type: 'FINDING_CLOSED',
    title: `Closed: ${finding.number}`,
    body: `${finding.branch.name} — ${finding.itemText}. Verified by ${actor.name}.`,
    link: `/findings/${finding.id}`,
    entityType: 'Finding',
    entityId: finding.id,
  });

  return updated;
}

/**
 * Verifier rejects the evidence. The finding drops back to In Progress so the
 * branch must upload fresh proof — a rejection is never a dead end.
 */
export async function rejectEvidence(actor: SessionUser, findingId: string, comment: string) {
  if (!comment.trim()) throw badRequest('A rejection must explain what is missing');

  const finding = await loadFinding(actor, findingId);
  assertTransition(finding.status, 'REJECTED');

  const latest = finding.correctiveActions[0];
  if (!latest) throw badRequest('There is no submitted evidence to reject');

  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.correctiveAction.update({
      where: { id: latest.id },
      data: {
        verdict: 'REJECTED',
        verifiedById: actor.id,
        verifiedAt: now,
        verifierComment: comment.trim(),
      },
    });

    const row = await tx.finding.update({
      where: { id: finding.id },
      data: {
        // Straight back into the rework loop rather than parking in REJECTED.
        status: 'IN_PROGRESS',
        rejectionCount: { increment: 1 },
        evidenceSubmittedAt: null,
      },
    });

    await audit(
      actor,
      {
        action: 'finding.evidence_rejected',
        entityType: 'Finding',
        entityId: finding.id,
        summary: `${finding.number}: evidence rejected — ${comment.trim()}`,
        before: { status: finding.status },
        after: { status: 'IN_PROGRESS', rejectionCount: finding.rejectionCount + 1 },
      },
      tx,
    );

    return row;
  });

  await notify({
    organizationId: actor.organizationId,
    userIds: [
      ...(finding.assignedToId ? [finding.assignedToId] : []),
      ...(finding.branch.managerId ? [finding.branch.managerId] : []),
      latest.submittedById,
    ],
    type: 'EVIDENCE_REJECTED',
    title: `Evidence rejected: ${finding.number}`,
    body: `${comment.trim()} — new evidence is required.`,
    link: `/findings/${finding.id}`,
    entityType: 'Finding',
    entityId: finding.id,
  });

  return updated;
}

/** Reopens a closed finding — recorded loudly, because it reverses a closure. */
export async function reopenFinding(actor: SessionUser, findingId: string, reason: string) {
  if (!reason.trim()) throw badRequest('Give a reason for reopening this finding');

  const finding = await loadFinding(actor, findingId);
  if (finding.status !== 'CLOSED') throw badRequest('Only a closed finding can be reopened');

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.finding.update({
      where: { id: finding.id },
      data: {
        status: 'IN_PROGRESS',
        closedAt: null,
        closedById: null,
        closureNote: null,
        evidenceSubmittedAt: null,
      },
    });
    await audit(
      actor,
      {
        action: 'finding.reopened',
        entityType: 'Finding',
        entityId: finding.id,
        summary: `${finding.number} reopened by ${actor.name} — ${reason.trim()}`,
        before: { status: 'CLOSED', closedAt: finding.closedAt },
        after: { status: 'IN_PROGRESS' },
      },
      tx,
    );
    return row;
  });

  await notify({
    organizationId: actor.organizationId,
    userIds: [
      ...(finding.assignedToId ? [finding.assignedToId] : []),
      ...(finding.branch.managerId ? [finding.branch.managerId] : []),
    ],
    type: 'FINDING_ASSIGNED',
    level: 'WARNING',
    title: `Reopened: ${finding.number}`,
    body: `${reason.trim()}`,
    link: `/findings/${finding.id}`,
    entityType: 'Finding',
    entityId: finding.id,
  });

  return updated;
}
