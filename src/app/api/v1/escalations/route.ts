import { ok, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { runEscalationSweep } from '@/lib/domain/escalation';

/**
 * POST /api/v1/escalations — runs the deadline sweep for the caller's
 * organization: advances overdue findings up the escalation ladder and emits
 * due-soon / overdue notifications.
 *
 * Idempotent, so it is safe to call from a scheduler (cron, queue worker) as
 * often as the organization wants alerts evaluated.
 */
export const POST = route(async () => {
  const user = await requireApi('finding:assign');
  const result = await runEscalationSweep(user.organizationId);
  return ok({ data: result });
});
