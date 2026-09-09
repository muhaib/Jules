import type { Metadata } from 'next';

import { requirePage } from '@/lib/auth/guard';
import { orgConfig } from '@/lib/domain/settings';
import { prisma } from '@/lib/db';
import { Card, Field, PageHeader } from '@/components/ui/shell';
import { SettingsForm } from '@/components/settings-form';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requirePage('settings:manage');
  const cfg = await orgConfig(user.organizationId);

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true, legalName: true, slug: true, timezone: true, createdAt: true },
  });

  return (
    <>
      <PageHeader
        title="System settings"
        description="Scoring rules, remediation deadlines, escalation and recurrence detection."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1" title="Organization">
          <dl className="divide-y divide-line">
            <Field label="Name">{org?.name}</Field>
            <Field label="Legal name">{org?.legalName ?? '—'}</Field>
            <Field label="Identifier">
              <span className="font-mono text-xs">{org?.slug}</span>
            </Field>
            <Field label="Timezone">{org?.timezone}</Field>
          </dl>
          <p className="mt-3 border-t border-line pt-3 text-2xs leading-relaxed text-muted">
            All data in this organization is isolated. A user in another organization cannot read,
            search or export any of it, regardless of role.
          </p>
        </Card>

        <div className="lg:col-span-3">
          <SettingsForm config={cfg} />
        </div>
      </div>
    </>
  );
}
