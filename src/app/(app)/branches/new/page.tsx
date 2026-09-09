import type { Metadata } from 'next';

import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/auth/guard';
import { Card, PageHeader } from '@/components/ui/shell';
import { BranchForm } from '@/components/branch-form';

export const metadata: Metadata = { title: 'Add branch' };
export const dynamic = 'force-dynamic';

export default async function NewBranchPage() {
  const user = await requirePage('branch:create');

  const [regions, clusters, managers] = await Promise.all([
    prisma.region.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.cluster.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, regionId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId, role: 'BRANCH_MANAGER', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Branches', href: '/branches' }, { label: 'Add' }]}
        title="Add a branch"
      />
      <div className="max-w-2xl">
        <Card>
          <BranchForm regions={regions} clusters={clusters} managers={managers} />
        </Card>
      </div>
    </>
  );
}
