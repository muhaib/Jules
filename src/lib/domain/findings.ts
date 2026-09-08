import 'server-only';

import type { FindingStatus, Prisma, PrismaClient, Severity } from '@prisma/client';

import { prisma } from '@/lib/db';
import { badRequest } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { branchAudience, notify } from '@/lib/domain/notify';
import { orgConfig, type OrgConfig } from '@/lib/domain/settings';
import { recurrenceKey } from '@/lib/domain/recurrence';
import { dueDateFor, isTerminal, targetEscalationLevel } from '@/lib/domain/deadlines';

type Client = PrismaClient | Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Reference numbers
// ---------------------------------------------------------------------------

/**
 * Findings are numbered BR-<year>-<sequence>. The sequence is derived from the
 * highest existing number for the year, inside the caller's transaction, so
 * concurrent submissions cannot collide (the unique index is the backstop).
 */
export async function nextFindingNumber(organizationId: string, client: Client = prisma) {
  const year = new Date().getUTCFullYear();
  const prefix = `BR-${year}-`;
  const last = await client.finding.findFirst({
    where: { organizationId, number: { startsWith: prefix } },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const seq = last ? Number.parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

export async function nextInspectionReference(organizationId: string, client: Client = prisma) {
  const year = new Date().getUTCFullYear();
  const prefix = `INS-${year}-`;
  const last = await client.inspection.findFirst({
    where: { organizationId, reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const seq = last ? Number.parseInt(last.reference.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

export { recurrenceKey };

/**
 * Counts prior findings sharing this recurrence key inside the lookback window.
 * Returns the total occurrence count including the new one.
 */
export async function recurrenceInfo(
  organizationId: string,
  key: string,
  cfg: OrgConfig,
  client: Client = prisma,
) {
  const since = new Date(Date.now() - cfg.recurrenceWindowDays * 86_400_000);
  const priorCount = await client.finding.count({
    where: { organizationId, recurrenceKey: key, createdAt: { gte: since } },
  });
  const count = priorCount + 1;
  return { count, isRecurring: count >= cfg.recurrenceThreshold };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export type CreateFindingInput = {
  organizationId: string;
  branchId: string;
  inspectionId?: string | null;
  responseId?: string | null;
  categoryName: string;
  itemText: string;
  observation: string;
  severity: Severity;
  assignedToId?: string | null;
  dueDate?: Date | null;
};

/**
 * Creates a finding with its deadline, recurrence flag and default owner.
 * Called automatically for every non-compliant response at submission time, and
 * manually by managers raising an ad-hoc issue.
 */
export async function createFinding(
  actor: SessionUser,
  input: CreateFindingInput,
  cfg: OrgConfig,
  client: Client = prisma,
) {
  const key = recurrenceKey(input.branchId, input.itemText);
  const { count, isRecurring } = await recurrenceInfo(input.organizationId, key, cfg, client);

  const createdAt = new Date();
  const dueDate =
    input.dueDate ?? dueDateFor(createdAt, cfg.severity[input.severity].dueHours);

  // Default owner is the branch manager — the person accountable for the site.
  let assignedToId = input.assignedToId ?? null;
  if (!assignedToId) {
    const branch = await client.branch.findUnique({
      where: { id: input.branchId },
      select: { managerId: true },
    });
    assignedToId = branch?.managerId ?? null;
  }

  const number = await nextFindingNumber(input.organizationId, client);

  const finding = await client.finding.create({
    data: {
      organizationId: input.organizationId,
      number,
      branchId: input.branchId,
      inspectionId: input.inspectionId ?? null,
      responseId: input.responseId ?? null,
      categoryName: input.categoryName,
      itemText: input.itemText,
      observation: input.observation,
      severity: input.severity,
      status: assignedToId ? 'ASSIGNED' : 'OPEN',
      assignedToId,
      createdById: actor.id,
      dueDate,
      recurrenceKey: key,
      isRecurring,
      recurrenceCount: count,
    },
  });

  // Mark the whole recurring series so history reads consistently, not just the
  // latest occurrence.
  if (isRecurring) {
    await client.finding.updateMany({
      where: { organizationId: input.organizationId, recurrenceKey: key },
      data: { isRecurring: true },
    });
  }

  await audit(
    actor,
    {
      action: 'finding.created',
      entityType: 'Finding',
      entityId: finding.id,
      summary: `Raised ${finding.number} (${input.severity}) — ${input.itemText}`,
      after: { severity: input.severity, dueDate, assignedToId, isRecurring },
    },
    client,
  );

  return finding;
}

/** Notifications for a newly created finding. Called after the transaction commits. */
export async function announceFinding(findingId: string) {
  const finding = await prisma.finding.findUnique({
    where: { id: findingId },
    include: { branch: { select: { name: true } } },
  });
  if (!finding) return;

  const audience = await branchAudience(finding.organizationId, finding.branchId, [
    'BRANCH_MANAGER',
    'REGIONAL_MANAGER',
    ...(finding.severity === 'CRITICAL' ? (['SUPER_ADMIN'] as const) : []),
  ]);
  if (finding.assignedToId) audience.push(finding.assignedToId);

  await notify({
    organizationId: finding.organizationId,
    userIds: audience,
    type: 'FINDING_CREATED',
    level: finding.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
    title: `${finding.severity === 'CRITICAL' ? 'Critical finding' : 'New finding'} ${finding.number}`,
    body: `${finding.branch.name} — ${finding.itemText}. Due ${finding.dueDate.toDateString()}.`,
    link: `/findings/${finding.id}`,
    entityType: 'Finding',
    entityId: finding.id,
  });
}

// ---------------------------------------------------------------------------
// Lifecycle transitions
// ---------------------------------------------------------------------------

/**
 * Allowed transitions. Anything not listed here is rejected, so a finding can
 * never be quietly jumped from Open straight to Closed.
 */
const TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'ASSIGNED', 'CANCELLED'],
  IN_PROGRESS: ['EVIDENCE_SUBMITTED', 'ASSIGNED', 'CANCELLED'],
  EVIDENCE_SUBMITTED: ['UNDER_VERIFICATION', 'IN_PROGRESS', 'CANCELLED'],
  UNDER_VERIFICATION: ['CLOSED', 'REJECTED', 'CANCELLED'],
  REJECTED: ['IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'CANCELLED'],
  CLOSED: ['IN_PROGRESS'], // reopening only
  CANCELLED: [],
};

export function canTransition(from: FindingStatus, to: FindingStatus) {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: FindingStatus, to: FindingStatus) {
  if (!canTransition(from, to)) {
    throw badRequest(`A finding cannot move from ${humanStatus(from)} to ${humanStatus(to)}`);
  }
}

export const FINDING_STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  EVIDENCE_SUBMITTED: 'Evidence Submitted',
  UNDER_VERIFICATION: 'Under Verification',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export function humanStatus(status: FindingStatus) {
  return FINDING_STATUS_LABELS[status];
}

/** Ordered lifecycle used by the progress tracker in the UI. */
export const LIFECYCLE_STEPS: FindingStatus[] = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'EVIDENCE_SUBMITTED',
  'UNDER_VERIFICATION',
  'CLOSED',
];

// ---------------------------------------------------------------------------
// Escalation sweep
// ---------------------------------------------------------------------------

/**
 * Advances overdue findings up the escalation ladder and emits due-soon /
 * overdue notifications. Idempotent: a finding is only escalated when its target
 * level exceeds where it already sits, so running this repeatedly is safe.
 *
 * Intended to run from a scheduled job (cron / queue worker) and also invoked
 * opportunistically when a manager opens the findings board.
 */
export async function runEscalationSweep(organizationId: string, now = new Date()) {
  const cfg = await orgConfig(organizationId);

  const open = await prisma.finding.findMany({
    where: {
      organizationId,
      status: { notIn: ['CLOSED', 'CANCELLED'] },
    },
    include: { branch: { select: { name: true, regionId: true, managerId: true } } },
  });

  let escalated = 0;
  let dueSoonNotified = 0;
  let overdueNotified = 0;

  for (const finding of open) {
    const policy = cfg.severity[finding.severity];
    const target = targetEscalationLevel(finding, policy.escalateEveryHours, now);

    const isOverdue = finding.dueDate.getTime() < now.getTime();
    const isDueSoon =
      !isOverdue && finding.dueDate.getTime() - now.getTime() <= cfg.dueSoonHours * 3600 * 1000;

    if (target > finding.escalationLevel) {
      const capped = cappedLevel(target, cfg);
      if (capped > finding.escalationLevel) {
        await prisma.finding.update({
          where: { id: finding.id },
          data: { escalationLevel: capped, lastEscalatedAt: now },
        });

        const audience = await escalationAudience(finding.organizationId, finding.branchId, capped);
        await notify({
          organizationId: finding.organizationId,
          userIds: audience,
          type: 'ESCALATION',
          title: `Escalated: ${finding.number}`,
          body: `${finding.branch.name} — "${finding.itemText}" is overdue and has been escalated.`,
          link: `/findings/${finding.id}`,
          entityType: 'Finding',
          entityId: finding.id,
        });

        await audit(
          null,
          {
            action: 'finding.escalated',
            entityType: 'Finding',
            entityId: finding.id,
            summary: `${finding.number} escalated to level ${capped}`,
            before: { escalationLevel: finding.escalationLevel },
            after: { escalationLevel: capped },
          },
          prisma,
          finding.organizationId,
        );
        escalated += 1;
      }
    }

    // One notification per finding per state, deduplicated by checking whether an
    // identical unread alert already exists.
    if (isOverdue || isDueSoon) {
      const type = isOverdue ? 'FINDING_OVERDUE' : 'FINDING_DUE_SOON';
      const already = await prisma.notification.count({
        where: { entityType: 'Finding', entityId: finding.id, type },
      });
      if (already === 0) {
        const audience = [
          ...(finding.assignedToId ? [finding.assignedToId] : []),
          ...(finding.branch.managerId ? [finding.branch.managerId] : []),
        ];
        await notify({
          organizationId: finding.organizationId,
          userIds: audience,
          type,
          title: isOverdue ? `Finding overdue: ${finding.number}` : `Due soon: ${finding.number}`,
          body: `${finding.branch.name} — ${finding.itemText}`,
          link: `/findings/${finding.id}`,
          entityType: 'Finding',
          entityId: finding.id,
        });
        if (isOverdue) overdueNotified += 1;
        else dueSoonNotified += 1;
      }
    }
  }

  return { escalated, dueSoonNotified, overdueNotified, examined: open.length };
}

function cappedLevel(target: number, cfg: OrgConfig) {
  if (target >= 3 && !cfg.escalateToHeadOffice) target = 2;
  if (target >= 2 && !cfg.escalateToRegionalManager) target = 1;
  if (target >= 1 && !cfg.escalateToBranchManager) target = 0;
  return target;
}

async function escalationAudience(organizationId: string, branchId: string, level: number) {
  if (level >= 3) return branchAudience(organizationId, branchId, ['SUPER_ADMIN']);
  if (level === 2) return branchAudience(organizationId, branchId, ['REGIONAL_MANAGER']);
  return branchAudience(organizationId, branchId, ['BRANCH_MANAGER']);
}

export { isTerminal };
