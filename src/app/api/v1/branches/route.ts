import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, pagination, parseJson, route } from '@/lib/api';
import { badRequest, branchScope, requireApi } from '@/lib/auth/guard';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';

export const GET = route(async (req) => {
  const user = await requireApi('branch:view');
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pagination(url, 50);
  const scope = await branchScope(user);

  const q = url.searchParams.get('q');
  const regionId = url.searchParams.get('regionId');
  const status = url.searchParams.get('status');

  const where = {
    ...scope,
    ...(regionId ? { regionId } : {}),
    ...(status ? { status: status as never } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { code: { contains: q, mode: 'insensitive' as const } },
            { city: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.branch.count({ where }),
    prisma.branch.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      include: {
        region: { select: { id: true, name: true } },
        cluster: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return ok({ page, pageSize, total, data: rows });
});

const createSchema = z.object({
  name: z.string().min(1).max(160),
  code: z.string().min(1).max(40),
  regionId: z.string().min(1),
  clusterId: z.string().optional().nullable(),
  city: z.string().min(1).max(120),
  address: z.string().min(1).max(400),
  managerId: z.string().optional().nullable(),
  contactNumber: z.string().max(60).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  openingDate: z.coerce.date().optional().nullable(),
  branchType: z.string().max(80).default('Branch'),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const POST = route(async (req) => {
  const user = await requireApi('branch:create');
  const body = await parseJson(req, createSchema);
  const meta = await requestMeta();

  const region = await prisma.region.findFirst({
    where: { id: body.regionId, organizationId: user.organizationId },
  });
  if (!region) throw badRequest('Select a valid region');

  const duplicate = await prisma.branch.findFirst({
    where: { organizationId: user.organizationId, code: body.code },
  });
  if (duplicate) throw badRequest(`Branch code "${body.code}" is already in use`);

  const branch = await prisma.branch.create({
    data: {
      organizationId: user.organizationId,
      name: body.name,
      code: body.code,
      regionId: body.regionId,
      clusterId: body.clusterId || null,
      city: body.city,
      address: body.address,
      managerId: body.managerId || null,
      contactNumber: body.contactNumber || null,
      email: body.email || null,
      openingDate: body.openingDate ?? null,
      branchType: body.branchType,
      status: body.status,
    },
  });

  await audit(user, {
    action: 'branch.created',
    entityType: 'Branch',
    entityId: branch.id,
    summary: `Created branch ${branch.name} (${branch.code})`,
    after: branch,
    ...meta,
  });

  return ok({ data: branch }, { status: 201 });
});
