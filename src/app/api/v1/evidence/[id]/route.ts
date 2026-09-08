import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { badRequest, forbidden, notFound, requireApi, visibleBranchIds } from '@/lib/auth/guard';
import { storage } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/evidence/:id — streams the stored file.
 *
 * Evidence is never served from a public bucket URL: every read is authenticated
 * and scoped, so one organization's photos can never be fetched by another.
 */
export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireApi();
  const { id } = await ctx.params;

  const evidence = await prisma.evidence.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      finding: { select: { branchId: true } },
      response: { select: { inspection: { select: { branchId: true } } } },
    },
  });
  if (!evidence) throw notFound('Evidence not found');

  const branchId = evidence.finding?.branchId ?? evidence.response?.inspection.branchId ?? null;
  const allowed = await visibleBranchIds(user);
  if (branchId && allowed !== null && !allowed.includes(branchId)) {
    throw forbidden('This evidence belongs to a branch outside your scope');
  }

  const body = await storage().get(evidence.storageKey);

  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': evidence.mimeType,
      'content-length': String(body.byteLength),
      'content-disposition': `inline; filename="${encodeURIComponent(evidence.fileName)}"`,
      // Evidence is immutable once stored, so it can be cached hard — but only
      // in the user's own browser, never a shared proxy.
      'cache-control': 'private, max-age=31536000, immutable',
    },
  });
});

/** DELETE /api/v1/evidence/:id — only before the record it supports is locked. */
export const DELETE = route(async (_req, ctx: Ctx) => {
  const user = await requireApi();
  const { id } = await ctx.params;
  const meta = await requestMeta();

  const evidence = await prisma.evidence.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      response: { select: { inspection: { select: { status: true, inspectorId: true } } } },
      finding: { select: { status: true } },
    },
  });
  if (!evidence) throw notFound('Evidence not found');

  if (evidence.response?.inspection.status === 'SUBMITTED') {
    throw badRequest('Evidence on a submitted inspection cannot be deleted');
  }
  if (evidence.finding && ['CLOSED', 'CANCELLED'].includes(evidence.finding.status)) {
    throw badRequest('Evidence on a closed finding cannot be deleted');
  }
  if (evidence.uploadedById !== user.id && user.role !== 'SUPER_ADMIN') {
    throw forbidden('You can only remove evidence you uploaded');
  }

  await prisma.evidence.delete({ where: { id } });
  await storage().delete(evidence.storageKey).catch(() => undefined);

  await audit(user, {
    action: 'evidence.deleted',
    entityType: 'Evidence',
    entityId: id,
    summary: `Deleted evidence ${evidence.fileName}`,
    before: { storageKey: evidence.storageKey, checksum: evidence.checksum },
    ...meta,
  });

  return ok({ ok: true });
});
