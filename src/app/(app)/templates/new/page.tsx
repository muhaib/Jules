import type { Metadata } from 'next';

import { requirePage } from '@/lib/auth/guard';
import { Card, PageHeader } from '@/components/ui/shell';
import { TemplateCreateForm } from '@/components/template-create-form';

export const metadata: Metadata = { title: 'New template' };

export default async function NewTemplatePage() {
  await requirePage('template:manage');
  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Templates', href: '/templates' }, { label: 'New' }]}
        title="New inspection template"
        description="Create the template, then add categories and checklist items to it."
      />
      <div className="max-w-2xl">
        <Card>
          <TemplateCreateForm />
        </Card>
      </div>
    </>
  );
}
