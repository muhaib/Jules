import type { Metadata } from 'next';
import Link from 'next/link';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { requirePage } from '@/lib/auth/guard';
import { auditLabel, AUDIT_ACTIONS } from '@/lib/audit';
import { fmtDateTime } from '@/lib/format';
import { date, endOfDay, num, str, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, PageHeader, TableWrap } from '@/components/ui/shell';
import { Pagination } from '@/components/ui/pagination';
import { FilterBar } from '@/components/filter-bar';

export const metadata: Metadata = { title: 'Audit trail' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * The audit trail is append-only. Nothing in the application updates or deletes
 * these rows, so historical inspection results cannot be silently rewritten.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage('audit:view');
  const params = await searchParams;

  const page = num(params, 'page', 1);
  const action = str(params, 'action');
  const entityType = str(params, 'entityType');
  const actorId = str(params, 'actorId');
  const from = date(params, 'from');
  const to = endOfDay(date(params, 'to'));

  const where: Prisma.AuditLogWhereInput = {
    organizationId: user.organizationId,
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(actorId ? { actorId } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [total, entries, actors] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const linkFor = (entityType: string, entityId: string) => {
    if (entityType === 'Finding') return `/findings/${entityId}`;
    if (entityType === 'Inspection') return `/inspections/${entityId}`;
    if (entityType === 'Branch') return `/branches/${entityId}`;
    return null;
  };

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every action that changes an inspection, finding or configuration, with who did it and when."
      />

      <div className="mb-5 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-muted">
        This log is append-only. Corrections are recorded as new entries — nothing here can be edited
        or removed from within the application, so historical inspection results cannot be silently
        rewritten.
      </div>

      <FilterBar
        filters={[
          {
            name: 'action',
            label: 'Action',
            options: Object.entries(AUDIT_ACTIONS).map(([value, label]) => ({ value, label })),
          },
          {
            name: 'entityType',
            label: 'Record type',
            options: ['Inspection', 'Finding', 'Branch', 'User', 'Evidence', 'Export'].map((v) => ({
              value: v,
              label: v,
            })),
          },
          { name: 'actorId', label: 'User', options: actors.map((a) => ({ value: a.id, label: a.name })) },
        ]}
      />

      <Card bodyClassName="">
        {entries.length === 0 ? (
          <EmptyState title="No audit entries match these filters" />
        ) : (
          <>
            <TableWrap minWidth={880}>
              <thead>
                <tr>
                  <th className="th">When</th>
                  <th className="th">User</th>
                  <th className="th">Action</th>
                  <th className="th">Record</th>
                  <th className="th">Detail</th>
                  <th className="th">Source</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const href = linkFor(e.entityType, e.entityId);
                  return (
                    <tr key={e.id}>
                      <td className="td whitespace-nowrap text-muted">{fmtDateTime(e.createdAt)}</td>
                      <td className="td">{e.actorLabel}</td>
                      <td className="td whitespace-nowrap">{auditLabel(e.action)}</td>
                      <td className="td">
                        {href ? (
                          <Link href={href} className="text-accent hover:underline">
                            {e.entityType}
                          </Link>
                        ) : (
                          <span className="text-muted">{e.entityType}</span>
                        )}
                      </td>
                      <td className="td max-w-[28rem] text-muted">{e.summary}</td>
                      <td className="td whitespace-nowrap text-2xs text-faint">
                        {e.ipAddress ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableWrap>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              basePath="/audit"
              params={{
                action,
                entityType,
                actorId,
                from: str(params, 'from'),
                to: str(params, 'to'),
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}
