import { z } from 'zod';

import { prisma } from '@/lib/db';
import { ok, pagination, parseJson, route } from '@/lib/api';
import { badRequest, requireApi } from '@/lib/auth/guard';
import { hashPassword, passwordProblems } from '@/lib/auth/password';
import { audit } from '@/lib/audit';
import { requestMeta } from '@/lib/auth/session';

export const GET = route(async (req) => {
  const user = await requireApi('user:view');
  const url = new URL(req.url);
  const { page, pageSize, skip, take } = pagination(url, 50);
  const role = url.searchParams.get('role');

  const where = {
    organizationId: user.organizationId,
    ...(role ? { role: role as never } : {}),
    ...(url.searchParams.get('active') === 'true' ? { isActive: true } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
      // passwordHash is never selected.
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        jobTitle: true,
        phone: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
  ]);

  return ok({ page, pageSize, total, data: rows });
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(1),
  role: z.enum(['SUPER_ADMIN', 'REGIONAL_MANAGER', 'INSPECTOR', 'BRANCH_MANAGER', 'VERIFIER']),
  jobTitle: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  regionIds: z.array(z.string()).optional(),
  branchIds: z.array(z.string()).optional(),
});

export const POST = route(async (req) => {
  const actor = await requireApi('user:create');
  const body = await parseJson(req, createSchema);
  const meta = await requestMeta();

  const problems = passwordProblems(body.password);
  if (problems.length > 0) {
    throw badRequest(`Password does not meet the policy: ${problems.join(', ')}`);
  }

  const email = body.email.toLowerCase().trim();
  const existing = await prisma.user.findFirst({
    where: { organizationId: actor.organizationId, email },
  });
  if (existing) throw badRequest(`A user with the email ${email} already exists`);

  // Scope assignments must stay inside the caller's organization.
  const [regions, branches] = await Promise.all([
    body.regionIds?.length
      ? prisma.region.findMany({
          where: { id: { in: body.regionIds }, organizationId: actor.organizationId },
          select: { id: true },
        })
      : Promise.resolve([]),
    body.branchIds?.length
      ? prisma.branch.findMany({
          where: { id: { in: body.branchIds }, organizationId: actor.organizationId },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const created = await prisma.user.create({
    data: {
      organizationId: actor.organizationId,
      name: body.name,
      email,
      passwordHash: await hashPassword(body.password),
      role: body.role,
      jobTitle: body.jobTitle ?? null,
      phone: body.phone ?? null,
      regionAssignments: { create: regions.map((r) => ({ regionId: r.id })) },
      branchAssignments: { create: branches.map((b) => ({ branchId: b.id })) },
    },
    select: { id: true, name: true, email: true, role: true },
  });

  await audit(actor, {
    action: 'user.created',
    entityType: 'User',
    entityId: created.id,
    summary: `Created ${created.name} (${created.email}) as ${created.role}`,
    after: { role: created.role, regions: regions.length, branches: branches.length },
    ...meta,
  });

  return ok({ data: created }, { status: 201 });
});
