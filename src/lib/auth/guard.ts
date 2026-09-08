import 'server-only';

import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/db';
import { getSessionUser, type SessionUser } from '@/lib/auth/session';
import { roleHas, type PermissionCode } from '@/lib/auth/permissions';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, 'Authentication required');
export const forbidden = (msg = 'You do not have permission to perform this action') =>
  new HttpError(403, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const badRequest = (msg: string) => new HttpError(400, msg);

/** Page guard: redirects to login instead of throwing. */
export async function requirePage(permission?: PermissionCode): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (permission && !roleHas(user.role, permission)) redirect('/dashboard?denied=1');
  return user;
}

/** API guard: throws HttpError, translated to a JSON response by the route wrapper. */
export async function requireApi(permission?: PermissionCode): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  if (permission && !roleHas(user.role, permission)) throw forbidden();
  return user;
}

export function can(user: SessionUser, permission: PermissionCode) {
  return roleHas(user.role, permission);
}

export function assertCan(user: SessionUser, permission: PermissionCode) {
  if (!roleHas(user.role, permission)) throw forbidden();
}

// ---------------------------------------------------------------------------
// Data scoping
// ---------------------------------------------------------------------------

/**
 * The set of branch ids a user may see, or `null` meaning "every branch in the
 * organization". Organization isolation is applied on top of this in every
 * query builder below — a user can never reach another organization's rows.
 */
export async function visibleBranchIds(user: SessionUser): Promise<string[] | null> {
  if (user.role === 'SUPER_ADMIN' || user.role === 'VERIFIER') return null;

  if (user.role === 'REGIONAL_MANAGER') {
    const regions = await prisma.userRegion.findMany({
      where: { userId: user.id },
      select: { regionId: true },
    });
    const regionIds = regions.map((r) => r.regionId);

    const branches = await prisma.branch.findMany({
      where: {
        organizationId: user.organizationId,
        OR: [
          ...(regionIds.length ? [{ regionId: { in: regionIds } }] : []),
          { assignments: { some: { userId: user.id } } },
        ],
      },
      select: { id: true },
    });
    return branches.map((b) => b.id);
  }

  // Inspectors and branch managers: explicitly assigned branches, plus any
  // branch they are recorded as managing.
  const branches = await prisma.branch.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [{ assignments: { some: { userId: user.id } } }, { managerId: user.id }],
    },
    select: { id: true },
  });
  return branches.map((b) => b.id);
}

/** Branch `where` clause honouring both tenancy and role scope. */
export async function branchScope(user: SessionUser): Promise<Prisma.BranchWhereInput> {
  const ids = await visibleBranchIds(user);
  return {
    organizationId: user.organizationId,
    ...(ids === null ? {} : { id: { in: ids } }),
  };
}

export async function inspectionScope(user: SessionUser): Promise<Prisma.InspectionWhereInput> {
  const ids = await visibleBranchIds(user);
  const base: Prisma.InspectionWhereInput = { organizationId: user.organizationId };

  if (user.role === 'INSPECTOR') {
    // An inspector sees their own work, plus anything at a branch assigned to them.
    return {
      ...base,
      OR: [{ inspectorId: user.id }, ...(ids && ids.length ? [{ branchId: { in: ids } }] : [])],
    };
  }
  if (ids === null) return base;
  return { ...base, branchId: { in: ids } };
}

export async function findingScope(user: SessionUser): Promise<Prisma.FindingWhereInput> {
  const ids = await visibleBranchIds(user);
  const base: Prisma.FindingWhereInput = { organizationId: user.organizationId };

  if (ids === null) return base;

  return {
    ...base,
    OR: [
      ...(ids.length ? [{ branchId: { in: ids } }] : []),
      { assignedToId: user.id },
      { createdById: user.id },
    ],
  };
}

/** Loads a branch, or throws 404 if it is outside the caller's scope. */
export async function loadBranchOr404(user: SessionUser, branchId: string) {
  const scope = await branchScope(user);
  const branch = await prisma.branch.findFirst({ where: { ...scope, id: branchId } });
  if (!branch) throw notFound('Branch not found');
  return branch;
}

export async function assertBranchInScope(user: SessionUser, branchId: string) {
  await loadBranchOr404(user, branchId);
}
