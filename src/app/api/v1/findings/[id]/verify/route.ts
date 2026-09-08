import { z } from 'zod';

import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { acceptEvidence, rejectEvidence } from '@/lib/domain/corrective';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('ACCEPT'), comment: z.string().max(4000).optional() }),
  z.object({
    decision: z.literal('REJECT'),
    comment: z.string().min(1, 'A rejection must explain what is missing').max(4000),
  }),
]);

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('finding:verify');
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);

  const finding =
    body.decision === 'ACCEPT'
      ? await acceptEvidence(user, id, body.comment)
      : await rejectEvidence(user, id, body.comment);

  return ok({ data: finding });
});
