import { z } from 'zod';

import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { submitEvidence } from '@/lib/domain/corrective';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  description: z.string().min(1, 'Describe the corrective action taken').max(4000),
  actionTaken: z.string().max(4000).optional(),
  evidenceIds: z.array(z.string()).max(50).optional(),
});

/** Submits a remediation attempt for verification. */
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('finding:respond');
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const action = await submitEvidence(user, id, body);
  return ok({ data: action }, { status: 201 });
});
