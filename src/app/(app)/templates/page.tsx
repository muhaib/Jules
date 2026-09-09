import type { Metadata } from 'next';
import Link from 'next/link';

import { prisma } from '@/lib/db';
import { can, requirePage } from '@/lib/auth/guard';
import { fmtDate } from '@/lib/format';
import { Card, EmptyState, PageHeader, TableWrap } from '@/components/ui/shell';
import { Badge } from '@/components/ui/badges';

export const metadata: Metadata = { title: 'Templates' };
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const user = await requirePage('template:view');

  const templates = await prisma.inspectionTemplate.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: 'asc' },
    include: {
      categories: { where: { isActive: true }, include: { _count: { select: { items: true } } } },
      _count: { select: { inspections: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Inspection templates"
        description="The checklists inspectors work through. Editing a template never changes an inspection that has already been submitted."
        actions={
          can(user, 'template:manage') ? (
            <Link href="/templates/new" className="btn-primary">
              New template
            </Link>
          ) : null
        }
      />

      <Card bodyClassName="">
        {templates.length === 0 ? (
          <EmptyState title="No templates yet" description="Create a template to start assigning inspections." />
        ) : (
          <TableWrap minWidth={760}>
            <thead>
              <tr>
                <th className="th">Template</th>
                <th className="th">Applies to</th>
                <th className="th text-right">Categories</th>
                <th className="th text-right">Items</th>
                <th className="th text-right">Inspections</th>
                <th className="th">Version</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const items = t.categories.reduce((n, c) => n + c._count.items, 0);
                return (
                  <tr key={t.id} className="row-link">
                    <td className="td">
                      <Link href={`/templates/${t.id}`} className="font-medium hover:text-accent hover:underline">
                        {t.name}
                      </Link>
                      {t.description && (
                        <div className="max-w-[28rem] truncate text-2xs text-muted">{t.description}</div>
                      )}
                    </td>
                    <td className="td text-muted">{t.branchType ?? 'All branch types'}</td>
                    <td className="td text-right tabular-nums">{t.categories.length}</td>
                    <td className="td text-right tabular-nums">{items}</td>
                    <td className="td text-right tabular-nums">{t._count.inspections}</td>
                    <td className="td text-muted">v{t.version}</td>
                    <td className="td">
                      <Badge tone={t.isActive ? 'ok' : 'neutral'}>{t.isActive ? 'Active' : 'Inactive'}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-4" title="How templates are versioned">
        <p className="text-sm leading-relaxed text-muted">
          When an inspection is assigned, the template is snapshotted onto it and every checklist item
          is copied onto the inspection&rsquo;s responses. Later edits to a template therefore change
          only future inspections — a report from six months ago always shows the questions that were
          actually asked at the time.
        </p>
      </Card>
    </>
  );
}
