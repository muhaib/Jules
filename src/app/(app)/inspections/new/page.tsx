import type { Metadata } from 'next';

import { prisma } from '@/lib/db';
import { branchScope, requirePage } from '@/lib/auth/guard';
import { str, type SearchParams } from '@/lib/filters';
import { Card, PageHeader } from '@/components/ui/shell';
import { AssignInspectionForm } from '@/components/assign-inspection-form';

export const metadata: Metadata = { title: 'Assign inspection' };
export const dynamic = 'force-dynamic';

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage('inspection:assign');
  const params = await searchParams;
  const scope = await branchScope(user);

  const [branches, templates, inspectors] = await Promise.all([
    prisma.branch.findMany({
      where: { ...scope, status: 'ACTIVE' },
      select: { id: true, name: true, code: true, branchType: true },
      orderBy: { name: 'asc' },
    }),
    prisma.inspectionTemplate.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      select: { id: true, name: true, branchType: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, role: 'INSPECTOR', isActive: true },
      select: { id: true, name: true, jobTitle: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Inspections', href: '/inspections' }, { label: 'Assign' }]}
        title="Assign an inspection"
        description="The inspector is notified immediately and can download the checklist for offline use."
      />
      <div className="max-w-2xl">
        <Card>
          <AssignInspectionForm
            branches={branches}
            templates={templates}
            inspectors={inspectors}
            defaultBranchId={str(params, 'branchId')}
          />
        </Card>
      </div>
    </>
  );
}
