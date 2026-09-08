import { z } from 'zod';

import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { submitInspection } from '@/lib/domain/inspections';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ summary: z.string().max(4000).optional() });

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('inspection:conduct');
  const { id } = await ctx.params;
  const body = await parseJson(req, schema).catch(() => ({ summary: undefined }));

  const result = await submitInspection(user, id, body.summary);
  return ok({ data: result });
});
