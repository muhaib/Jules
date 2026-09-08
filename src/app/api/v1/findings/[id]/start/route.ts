import { z } from 'zod';

import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { startCorrectiveAction } from '@/lib/domain/corrective';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ note: z.string().max(1000).optional() });

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('finding:respond');
  const { id } = await ctx.params;
  const body = await parseJson(req, schema).catch(() => ({ note: undefined }));
  const finding = await startCorrectiveAction(user, id, body.note);
  return ok({ data: finding });
});
