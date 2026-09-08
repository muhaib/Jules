import 'server-only';

import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';

type Client = PrismaClient | Prisma.TransactionClient;

export type AuditInput = {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

/**
 * Appends an audit record. Audit rows are never updated or deleted anywhere in
 * the application — a correction is a new row, so history stays intact.
 *
 * Pass the transaction client when the audited change is itself transactional so
 * the trail cannot drift from the data.
 */
export async function audit(
  actor: SessionUser | { id: string; name: string; organizationId: string } | null,
  input: AuditInput,
  client: Client = prisma,
  organizationId?: string,
) {
  const orgId = organizationId ?? actor?.organizationId;
  if (!orgId) throw new Error('audit() requires an organization context');

  await client.auditLog.create({
    data: {
      organizationId: orgId,
      actorId: actor?.id ?? null,
      actorLabel: actor?.name ?? 'System',
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

/** Human-readable labels for the action codes used across the app. */
export const AUDIT_ACTIONS = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in attempt',
  'auth.logout': 'Signed out',
  'auth.password_reset_requested': 'Requested a password reset',
  'auth.password_reset': 'Reset password',
  'user.created': 'Created user',
  'user.updated': 'Updated user',
  'user.deactivated': 'Deactivated user',
  'branch.created': 'Created branch',
  'branch.updated': 'Updated branch',
  'region.created': 'Created region',
  'template.created': 'Created template',
  'template.updated': 'Updated template',
  'settings.updated': 'Updated organization settings',
  'inspection.assigned': 'Assigned inspection',
  'inspection.started': 'Started inspection',
  'inspection.response_saved': 'Recorded checklist response',
  'inspection.submitted': 'Submitted inspection',
  'inspection.cancelled': 'Cancelled inspection',
  'inspection.synced': 'Synced offline inspection data',
  'finding.created': 'Created finding',
  'finding.assigned': 'Assigned finding',
  'finding.started': 'Started corrective action',
  'finding.evidence_submitted': 'Submitted corrective evidence',
  'finding.evidence_accepted': 'Accepted corrective evidence',
  'finding.evidence_rejected': 'Rejected corrective evidence',
  'finding.reopened': 'Reopened finding',
  'finding.closed': 'Closed finding',
  'finding.escalated': 'Escalated finding',
  'evidence.uploaded': 'Uploaded evidence',
  'evidence.deleted': 'Deleted evidence',
  'export.pdf': 'Downloaded PDF report',
  'export.excel': 'Downloaded Excel export',
} as const;

export function auditLabel(action: string) {
  return (AUDIT_ACTIONS as Record<string, string>)[action] ?? action;
}
