import { z } from 'zod';

import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { reopenFinding } from '@/lib/domain/corrective';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ reason: z.string().min(1, 'Give a reason for reopening').max(4000) });

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('finding:verify');
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const finding = await reopenFinding(user, id, body.reason);
  return ok({ data: finding });
});
