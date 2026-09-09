import { route } from '@/lib/api';
import { inspectionScope, notFound, requireApi } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';
import { buildInspectionReport } from '@/lib/pdf/inspection-report';

type Ctx = { params: Promise<{ id: string }> };

// pdfkit needs the Node runtime, not the edge runtime.
export const runtime = 'nodejs';

/** GET /api/v1/inspections/:id/report.pdf — the full inspection report. */
export const GET = route(async (_req, ctx: Ctx) => {
  const user = await requireApi('inspection:view');
  const { id } = await ctx.params;

  // Scope check before generating anything expensive.
  const scope = await inspectionScope(user);
  const allowed = await prisma.inspection.findFirst({
    where: { ...scope, id },
    select: { id: true, status: true },
  });
  if (!allowed) throw notFound('Inspection not found');

  const report = await buildInspectionReport(id, user.organizationId);
  if (!report) throw notFound('Inspection not found');

  const meta = await requestMeta();
  await audit(user, {
    action: 'export.pdf',
    entityType: 'Inspection',
    entityId: id,
    summary: `Downloaded the PDF report for ${report.reference}`,
    ...meta,
  });

  return new Response(new Uint8Array(report.buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(report.buffer.byteLength),
      'content-disposition': `inline; filename="${report.reference}-inspection-report.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
});
