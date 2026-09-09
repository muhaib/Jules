import type { Metadata } from 'next';
import { notFound as nextNotFound, redirect } from 'next/navigation';

import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/auth/guard';
import { InspectionRunner } from '@/components/inspection-runner';
import type { CachedInspection } from '@/lib/offline/db';

export const metadata: Metadata = { title: 'Conduct inspection' };
export const dynamic = 'force-dynamic';

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage('inspection:conduct');
  const { id } = await params;

  const inspection = await prisma.inspection.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      branch: { select: { name: true, code: true } },
      template: { select: { name: true } },
      responses: {
        orderBy: { position: 'asc' },
        include: {
          checklistItem: {
            select: { guidance: true, isMandatory: true, requirePhotoOnFail: true, defaultSeverity: true },
          },
          _count: { select: { evidence: true } },
        },
      },
    },
  });

  if (!inspection) nextNotFound();

  // Only the assigned inspector runs it; anyone else gets the read-only view.
  if (inspection.inspectorId !== user.id && user.role !== 'SUPER_ADMIN') {
    redirect(`/inspections/${id}`);
  }
  if (inspection.status === 'SUBMITTED' || inspection.status === 'CANCELLED') {
    redirect(`/inspections/${id}`);
  }

  const categories: CachedInspection['categories'] = [];
  for (const r of inspection.responses) {
    let cat = categories.find((c) => c.name === r.categoryName);
    if (!cat) {
      cat = { name: r.categoryName, items: [] };
      categories.push(cat);
    }
    cat.items.push({
      responseId: r.id,
      checklistItemId: r.checklistItemId,
      text: r.itemText,
      guidance: r.checklistItem.guidance,
      isMandatory: r.checklistItem.isMandatory,
      requirePhotoOnFail: r.checklistItem.requirePhotoOnFail,
      defaultSeverity: r.checklistItem.defaultSeverity,
      result: r.result,
      observation: r.observation,
      comment: r.comment,
      severity: r.severity,
      evidenceCount: r._count.evidence,
    });
  }

  const payload: CachedInspection = {
    id: inspection.id,
    reference: inspection.reference,
    branchName: inspection.branch.name,
    branchCode: inspection.branch.code,
    templateName: inspection.template.name,
    scheduledFor: inspection.scheduledFor.toISOString(),
    status: inspection.status,
    categories,
    downloadedAt: Date.now(),
  };

  return <InspectionRunner initial={payload} />;
}
