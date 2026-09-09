import type { Metadata } from 'next';
import { notFound as nextNotFound } from 'next/navigation';

import { prisma } from '@/lib/db';
import { can, requirePage } from '@/lib/auth/guard';
import { SEVERITY_LABEL } from '@/lib/format';
import { Card, EmptyState, Field, PageHeader, TableWrap } from '@/components/ui/shell';
import { Badge, SeverityBadge } from '@/components/ui/badges';
import { TemplateEditor } from '@/components/template-editor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await prisma.inspectionTemplate.findUnique({ where: { id }, select: { name: true } });
  return { title: t?.name ?? 'Template' };
}

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePage('template:view');
  const { id } = await params;

  const template = await prisma.inspectionTemplate.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      categories: {
        orderBy: { position: 'asc' },
        include: { items: { orderBy: { position: 'asc' } } },
      },
      _count: { select: { inspections: true } },
    },
  });
  if (!template) nextNotFound();

  const editable = can(user, 'template:manage');
  const totalItems = template.categories.reduce((n, c) => n + c.items.length, 0);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Templates', href: '/templates' }, { label: template.name }]}
        title={template.name}
        description={template.description ?? undefined}
        actions={<Badge tone={template.isActive ? 'ok' : 'neutral'}>{template.isActive ? 'Active' : 'Inactive'}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1" title="Template detail">
          <dl className="divide-y divide-line">
            <Field label="Version">v{template.version}</Field>
            <Field label="Applies to">{template.branchType ?? 'All branch types'}</Field>
            <Field label="Categories">{template.categories.length}</Field>
            <Field label="Checklist items">{totalItems}</Field>
            <Field label="Inspections using it">{template._count.inspections}</Field>
          </dl>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {editable ? (
            <TemplateEditor
              templateId={template.id}
              categories={template.categories.map((c) => ({
                id: c.id,
                name: c.name,
                position: c.position,
                weight: c.weight,
                items: c.items.map((i) => ({
                  id: i.id,
                  text: i.text,
                  guidance: i.guidance,
                  position: i.position,
                  weight: i.weight,
                  isMandatory: i.isMandatory,
                  defaultSeverity: i.defaultSeverity,
                  requirePhotoOnFail: i.requirePhotoOnFail,
                })),
              }))}
            />
          ) : (
            <>
              {template.categories.length === 0 && (
                <Card>
                  <EmptyState title="This template has no categories yet" />
                </Card>
              )}
              {template.categories.map((c) => (
                <Card
                  key={c.id}
                  title={c.name}
                  description={`${c.items.length} items · weight ×${c.weight}`}
                  bodyClassName=""
                >
                  <TableWrap minWidth={620}>
                    <thead>
                      <tr>
                        <th className="th">Checklist item</th>
                        <th className="th">Default severity</th>
                        <th className="th text-right">Weight</th>
                        <th className="th">Mandatory</th>
                        <th className="th">Photo on fail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.items.map((i) => (
                        <tr key={i.id}>
                          <td className="td">
                            {i.text}
                            {i.guidance && <div className="text-2xs text-muted">{i.guidance}</div>}
                          </td>
                          <td className="td">
                            <SeverityBadge severity={i.defaultSeverity} />
                          </td>
                          <td className="td text-right tabular-nums">×{i.weight}</td>
                          <td className="td text-muted">{i.isMandatory ? 'Yes' : 'No'}</td>
                          <td className="td text-muted">{i.requirePhotoOnFail ? 'Required' : 'Optional'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
