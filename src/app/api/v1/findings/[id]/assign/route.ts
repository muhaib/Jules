import { z } from 'zod';

import { ok, parseJson, route } from '@/lib/api';
import { requireApi } from '@/lib/auth/guard';
import { assignFinding } from '@/lib/domain/corrective';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  assignedToId: z.string().min(1),
  dueDate: z.coerce.date().optional(),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  note: z.string().max(1000).optional(),
});

export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireApi('finding:assign');
  const { id } = await ctx.params;
  const body = await parseJson(req, schema);
  const finding = await assignFinding(user, id, body);
  return ok({ data: finding });
});
