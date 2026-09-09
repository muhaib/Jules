/**
 * Creates a second organization used only by scripts/verify-isolation.mjs.
 *
 * Kept separate from the demo seed so the ABC Bank dataset stays clean; run it
 * when you want to verify tenant isolation, and it is safe to re-run.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '@/lib/auth/password';

const prisma = new PrismaClient();

async function main() {
  const slug = 'zeta-retail';
  const existing = await prisma.organization.findUnique({ where: { slug } });
  if (existing) {
    await prisma.evidence.deleteMany({ where: { organizationId: existing.id } });
    await prisma.correctiveAction.deleteMany({ where: { finding: { organizationId: existing.id } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: existing.id } });
    await prisma.notification.deleteMany({ where: { organizationId: existing.id } });
    await prisma.finding.deleteMany({ where: { organizationId: existing.id } });
    await prisma.branch.updateMany({ where: { organizationId: existing.id }, data: { managerId: null } });
    await prisma.userBranch.deleteMany({ where: { user: { organizationId: existing.id } } });
    await prisma.userRegion.deleteMany({ where: { user: { organizationId: existing.id } } });
    await prisma.session.deleteMany({ where: { user: { organizationId: existing.id } } });
    await prisma.user.deleteMany({ where: { organizationId: existing.id } });
    await prisma.branch.deleteMany({ where: { organizationId: existing.id } });
    await prisma.region.deleteMany({ where: { organizationId: existing.id } });
    await prisma.organization.delete({ where: { id: existing.id } });
  }

  const org = await prisma.organization.create({
    data: { name: 'Zeta Retail', slug, settings: { create: {} } },
  });
  const region = await prisma.region.create({
    data: { organizationId: org.id, name: 'North', code: 'N' },
  });
  await prisma.branch.create({
    data: {
      organizationId: org.id, regionId: region.id, code: 'ZR-001',
      name: 'Zeta Store One', city: 'Karachi', address: 'Somewhere',
    },
  });
  const hash = await hashPassword('BranchCheck#2026');
  await prisma.user.create({
    data: {
      organizationId: org.id, email: 'admin@zetaretail.example', name: 'Zeta Admin',
      passwordHash: hash, role: 'SUPER_ADMIN',
    },
  });
  console.log('created org', org.slug, 'with a SUPER_ADMIN');
}

main().finally(() => prisma.$disconnect());
