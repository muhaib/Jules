import 'server-only';

import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { branchAudience, notify } from '@/lib/domain/notify';
import { orgConfig, type OrgConfig } from '@/lib/domain/settings';
import { targetEscalationLevel } from '@/lib/domain/deadlines';

/**
 * Deadline and escalation sweep.
 *
 * Deliberately free of any request-scoped dependency (no session, no guards, no
 * next/navigation) so it can run from a cron job, a queue worker or a seed
 * script as easily as from an API route.
 */
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
        // Scoped by organization as well as entity: this is a dedupe check, but
        // no query in the product reaches across a tenant boundary, even one
        // whose inputs already came from inside it.
        where: {
          organizationId,
          entityType: 'Finding',
          entityId: finding.id,
          type,
        },
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
