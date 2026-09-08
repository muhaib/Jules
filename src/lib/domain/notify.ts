import 'server-only';

import type { NotificationLevel, NotificationType, Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db';

type Client = PrismaClient | Prisma.TransactionClient;

export type NotifyInput = {
  organizationId: string;
  userIds: string[];
  type: NotificationType;
  level?: NotificationLevel;
  title: string;
  body: string;
  link?: string;
  entityType?: string;
  entityId?: string;
};

const DEFAULT_LEVEL: Record<NotificationType, NotificationLevel> = {
  FINDING_CREATED: 'WARNING',
  FINDING_ASSIGNED: 'INFO',
  FINDING_DUE_SOON: 'DUE',
  FINDING_OVERDUE: 'CRITICAL',
  EVIDENCE_SUBMITTED: 'INFO',
  EVIDENCE_REJECTED: 'WARNING',
  FINDING_CLOSED: 'SUCCESS',
  INSPECTION_ASSIGNED: 'INFO',
  INSPECTION_SUBMITTED: 'INFO',
  ESCALATION: 'CRITICAL',
};

/**
 * Fans a notification out to recipients, honouring each user's per-type
 * preferences. Users opt out by setting `{ "<TYPE>": false }` in notifyPrefs;
 * everything is on by default.
 */
export async function notify(input: NotifyInput, client: Client = prisma) {
  const recipients = [...new Set(input.userIds.filter(Boolean))];
  if (recipients.length === 0) return;

  const users = await client.user.findMany({
    where: { id: { in: recipients }, isActive: true, organizationId: input.organizationId },
    select: { id: true, notifyPrefs: true },
  });

  const allowed = users.filter((u) => {
    const prefs = (u.notifyPrefs ?? {}) as Record<string, unknown>;
    return prefs[input.type] !== false;
  });

  if (allowed.length === 0) return;

  await client.notification.createMany({
    data: allowed.map((u) => ({
      organizationId: input.organizationId,
      userId: u.id,
      type: input.type,
      level: input.level ?? DEFAULT_LEVEL[input.type],
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
}

/** Everyone who should hear about an event at a given branch, by role. */
export async function branchAudience(
  organizationId: string,
  branchId: string,
  roles: ('SUPER_ADMIN' | 'REGIONAL_MANAGER' | 'BRANCH_MANAGER' | 'VERIFIER' | 'INSPECTOR')[],
  client: Client = prisma,
): Promise<string[]> {
  const branch = await client.branch.findUnique({
    where: { id: branchId },
    select: { managerId: true, regionId: true },
  });
  if (!branch) return [];

  const ids = new Set<string>();
  if (branch.managerId && roles.includes('BRANCH_MANAGER')) ids.add(branch.managerId);

  const users = await client.user.findMany({
    where: {
      organizationId,
      isActive: true,
      role: { in: roles },
      OR: [
        { role: { in: ['SUPER_ADMIN', 'VERIFIER'] } },
        { regionAssignments: { some: { regionId: branch.regionId } } },
        { branchAssignments: { some: { branchId } } },
      ],
    },
    select: { id: true, role: true },
  });

  for (const u of users) if (roles.includes(u.role as never)) ids.add(u.id);
  return [...ids];
}

export const NOTIFICATION_ICON: Record<NotificationLevel, string> = {
  CRITICAL: '🔴',
  WARNING: '🟠',
  DUE: '🟡',
  INFO: '🔵',
  SUCCESS: '🟢',
};
