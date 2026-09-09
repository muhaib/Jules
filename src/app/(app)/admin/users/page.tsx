import type { Metadata } from 'next';

import { prisma } from '@/lib/db';
import { can, requirePage } from '@/lib/auth/guard';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_PERMISSIONS, PERMISSIONS } from '@/lib/auth/permissions';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { Card, EmptyState, PageHeader, TableWrap } from '@/components/ui/shell';
import { Badge } from '@/components/ui/badges';
import { UserForm } from '@/components/user-form';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const user = await requirePage('user:view');
  const manage = can(user, 'user:create');

  const [users, branches, regions] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: user.organizationId },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      include: {
        branchAssignments: { include: { branch: { select: { name: true, code: true } } } },
        regionAssignments: { include: { region: { select: { name: true } } } },
        _count: { select: { findingsAssigned: true, inspectionsAssigned: true } },
      },
    }),
    prisma.branch.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    }),
    prisma.region.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in, what they can do, and which branches they can see."
      />

      {manage && (
        <Card className="mb-4" title="Add a user">
          <UserForm branches={branches} regions={regions} />
        </Card>
      )}

      <Card title={`${users.length} users`} bodyClassName="">
        {users.length === 0 ? (
          <EmptyState title="No users yet" />
        ) : (
          <TableWrap minWidth={940}>
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Email</th>
                <th className="th">Role</th>
                <th className="th">Scope</th>
                <th className="th text-right">Open work</th>
                <th className="th">Last sign-in</th>
                <th className="th">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="td">
                    <div className="font-medium">{u.name}</div>
                    {u.jobTitle && <div className="text-2xs text-muted">{u.jobTitle}</div>}
                  </td>
                  <td className="td text-muted">{u.email}</td>
                  <td className="td">
                    <Badge tone={u.role === 'SUPER_ADMIN' ? 'accent' : 'neutral'}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </td>
                  <td className="td max-w-[18rem] text-2xs text-muted">
                    {u.role === 'SUPER_ADMIN' || u.role === 'VERIFIER'
                      ? 'All branches'
                      : u.regionAssignments.length > 0
                        ? u.regionAssignments.map((r) => r.region.name).join(', ')
                        : u.branchAssignments.length > 0
                          ? u.branchAssignments.map((b) => b.branch.code).join(', ')
                          : 'No branches assigned'}
                  </td>
                  <td className="td text-right tabular-nums text-muted">
                    {u._count.findingsAssigned + u._count.inspectionsAssigned}
                  </td>
                  <td className="td whitespace-nowrap text-muted">
                    {u.lastLoginAt ? relativeTime(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="td">
                    <Badge tone={u.isActive ? 'ok' : 'neutral'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card className="mt-4" title="Roles and permissions" description="What each role is allowed to do">
        <div className="space-y-4">
          {(Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]).map((role) => (
            <div key={role} className="border-b border-line pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold text-ink">{ROLE_LABELS[role]}</h3>
                <span className="text-xs text-muted">{ROLE_DESCRIPTIONS[role]}</span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {ROLE_PERMISSIONS[role].map((code) => (
                  <li
                    key={code}
                    className="rounded border border-line bg-raised px-2 py-0.5 text-2xs text-muted"
                    title={PERMISSIONS[code].description}
                  >
                    {code}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
