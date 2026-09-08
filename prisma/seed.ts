/**
 * Demo dataset for ABC Bank.
 *
 * Generates a coherent operating history rather than random rows: branch scores
 * improve over time, findings age into overdue, some are verified and closed,
 * and one item repeats at the same branch so recurrence detection has something
 * real to flag.
 *
 * Deterministic — running it twice produces the same data.
 */
import {
  PrismaClient,
  type FindingStatus,
  type Prisma,
  type ResponseResult,
  type Severity,
} from '@prisma/client';

import { hashPassword } from '../src/lib/auth/password';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../src/lib/auth/permissions';
import { computeScore, DEFAULT_SCORING } from '../src/lib/domain/scoring';
import { DEFAULT_SEVERITY_COLORS, DEFAULT_SEVERITY_HOURS } from '../src/lib/domain/deadlines';
import { buildRecommendation } from '../src/lib/domain/recommendation';
import { storeEvidence } from '../src/lib/storage';
import { makeRng } from './seed/rng';
import { ATM_TEMPLATE, BANK_BRANCH_TEMPLATE, type SeedCategory } from './seed/template';
import {
  AFTER_PALETTE,
  BEFORE_PALETTE,
  placeholderPng,
} from './seed/placeholder-image';
import {
  BRANCHES,
  BRANCH_MANAGERS,
  CLUSTERS,
  DEMO_PASSWORD,
  ORG,
  REGIONS,
  USERS,
  observationFor,
} from './seed/data';

const prisma = new PrismaClient();
const rng = makeRng(20260908);

// Data is generated relative to a fixed "today" so the demo always shows a
// sensible mix of on-track, due-soon and overdue work.
const NOW = new Date('2026-09-08T09:00:00.000Z');
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// The four inspection rounds in the brief's branch-history example.
const ROUNDS = [
  { label: 'Jan 2026', date: new Date('2026-01-19T09:00:00.000Z') },
  { label: 'Mar 2026', date: new Date('2026-03-16T09:00:00.000Z') },
  { label: 'Jun 2026', date: new Date('2026-06-15T09:00:00.000Z') },
  { label: 'Sep 2026', date: new Date('2026-09-02T09:00:00.000Z') },
];

// Featured branches follow the improvement curve from the brief.
const FEATURED_TARGETS: Record<string, number[]> = {
  'MUL-001': [81, 86, 91, 94],
  'MUL-002': [76, 82, 85, 89],
  'MUL-003': [72, 74, 80, 83],
  'LHR-001': [88, 90, 93, 95],
  'ISB-001': [84, 87, 86, 90],
};

const RECURRING_ITEM = 'Fire exit access';

async function main() {
  buildImagePool();

  console.log('Resetting demo data…');
  await resetOrganization();

  console.log('Creating organization, settings and policies…');
  const org = await createOrganization();

  console.log('Seeding permission catalogue…');
  await seedPermissions();

  console.log('Creating regions, clusters and branches…');
  const { regionByCode, branchByCode } = await createStructure(org.id);

  console.log('Creating users and assignments…');
  const { userByKey, managerByBranch } = await createUsers(org.id, regionByCode, branchByCode);

  console.log('Creating inspection templates…');
  const template = await createTemplate(org.id, 'Bank Branch Facility Inspection',
    'Quarterly facility, safety and security inspection for full-service and sub branches.',
    BANK_BRANCH_TEMPLATE);
  await createTemplate(org.id, 'ATM Site Inspection',
    'Monthly off-site ATM safety and security check.', ATM_TEMPLATE, 'ATM');

  console.log('Generating inspection history…');
  const inspectors = ['insp-1', 'insp-2', 'insp-3', 'insp-4'].map((k) => userByKey[k]);
  const admin = userByKey['admin'];

  let inspectionCount = 0;
  let findingCount = 0;

  for (const branch of BRANCHES) {
    const branchId = branchByCode[branch.code];
    const rounds = branch.featured ? ROUNDS : ROUNDS.slice(rng.int(1, 2));
    const targets = FEATURED_TARGETS[branch.code] ?? generateTargets();

    for (let i = 0; i < rounds.length; i++) {
      const round = rounds[i];
      const target = targets[ROUNDS.indexOf(round)] ?? targets[targets.length - 1];
      const inspector = rng.pick(inspectors);

      const result = await createHistoricalInspection({
        organizationId: org.id,
        branchCode: branch.code,
        branchId,
        templateId: template.id,
        categories: BANK_BRANCH_TEMPLATE,
        inspectorId: inspector.id,
        assignedById: admin.id,
        date: round.date,
        targetScore: target,
        roundIndex: ROUNDS.indexOf(round),
        featured: !!branch.featured,
        managerId: managerByBranch[branch.code] ?? null,
        verifierIds: [userByKey['ver-1'].id, userByKey['ver-2'].id],
      });

      inspectionCount += 1;
      findingCount += result.findings;
    }
  }

  console.log('Creating an in-flight inspection for the inspector demo login…');
  await createOpenInspection(
    org.id,
    branchByCode['MUL-002'],
    template.id,
    userByKey['insp-1'].id,
    admin.id,
  );
  await createOpenInspection(
    org.id,
    branchByCode['LHR-003'],
    template.id,
    userByKey['insp-2'].id,
    admin.id,
    'ASSIGNED',
  );

  console.log('Flagging recurring findings…');
  const recurring = await flagRecurrence(org.id);

  console.log('Running the escalation sweep…');
  // Use the production sweep rather than faking escalation levels, so the demo
  // shows exactly what the scheduled job would produce.
  const { runEscalationSweep } = await import('../src/lib/domain/escalation');
  const sweep = await runEscalationSweep(org.id, NOW);

  console.log('Generating assignment notifications…');
  await seedNotifications(org.id);

  const counts = await summary(org.id);
  console.log('\nDemo data ready:');
  console.log(`  Organization      ${ORG.name}`);
  console.log(`  Branches          ${counts.branches}`);
  console.log(`  Users             ${counts.users}`);
  console.log(`  Inspections       ${inspectionCount + 2} (${counts.submitted} submitted)`);
  console.log(`  Findings          ${findingCount}`);
  console.log(`    open            ${counts.open}`);
  console.log(`    overdue         ${counts.overdue}`);
  console.log(`    critical open   ${counts.critical}`);
  console.log(`    closed          ${counts.closed}`);
  console.log(`    recurring       ${recurring}`);
  console.log(`  Evidence files    ${counts.evidence}`);
  console.log(`  Escalated         ${sweep.escalated} (${sweep.overdueNotified} overdue alerts)`);
  console.log(`\n  Sign in with any account below and the password: ${DEMO_PASSWORD}`);
  for (const u of USERS) console.log(`    ${u.role.padEnd(17)} ${u.email}`);
  console.log(`    BRANCH_MANAGER    ${BRANCH_MANAGERS[0].email}`);
}

// ---------------------------------------------------------------------------

async function resetOrganization() {
  const existing = await prisma.organization.findUnique({ where: { slug: ORG.slug } });
  if (existing) {
    const organizationId = existing.id;
    // Deleted in dependency order. Rows that reference users (corrective
    // actions, evidence, audit entries) deliberately do NOT cascade from a user
    // in production — the app deactivates users rather than deleting them, so
    // history survives. The seed therefore clears them explicitly.
    await prisma.evidence.deleteMany({ where: { organizationId } });
    await prisma.correctiveAction.deleteMany({ where: { finding: { organizationId } } });
    await prisma.notification.deleteMany({ where: { organizationId } });
    await prisma.auditLog.deleteMany({ where: { organizationId } });
    await prisma.finding.deleteMany({ where: { organizationId } });
    await prisma.inspectionResponse.deleteMany({ where: { inspection: { organizationId } } });
    await prisma.inspection.deleteMany({ where: { organizationId } });
    await prisma.checklistItem.deleteMany({ where: { category: { template: { organizationId } } } });
    await prisma.inspectionCategory.deleteMany({ where: { template: { organizationId } } });
    await prisma.inspectionTemplate.deleteMany({ where: { organizationId } });
    await prisma.branch.updateMany({ where: { organizationId }, data: { managerId: null } });
    await prisma.userBranch.deleteMany({ where: { user: { organizationId } } });
    await prisma.userRegion.deleteMany({ where: { user: { organizationId } } });
    await prisma.session.deleteMany({ where: { user: { organizationId } } });
    await prisma.passwordResetToken.deleteMany({ where: { user: { organizationId } } });
    await prisma.user.deleteMany({ where: { organizationId } });
    await prisma.branch.deleteMany({ where: { organizationId } });
    await prisma.cluster.deleteMany({ where: { organizationId } });
    await prisma.region.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
  }
  await prisma.rolePermission.deleteMany({});
  await prisma.permission.deleteMany({});
}

async function createOrganization() {
  const org = await prisma.organization.create({
    data: {
      name: ORG.name,
      legalName: ORG.legalName,
      slug: ORG.slug,
      timezone: ORG.timezone,
      settings: { create: {} },
    },
  });

  await prisma.severityPolicy.createMany({
    data: (Object.keys(DEFAULT_SEVERITY_HOURS) as Severity[]).map((severity) => ({
      organizationId: org.id,
      severity,
      dueHours: DEFAULT_SEVERITY_HOURS[severity],
      escalateEveryHours: severity === 'CRITICAL' ? 12 : 24,
      colorHex: DEFAULT_SEVERITY_COLORS[severity],
    })),
  });

  return org;
}

async function seedPermissions() {
  for (const [code, meta] of Object.entries(PERMISSIONS)) {
    await prisma.permission.create({
      data: { code, description: meta.description, category: meta.category },
    });
  }
  const all = await prisma.permission.findMany();
  const byCode = new Map(all.map((p) => [p.code, p.id]));

  for (const [role, codes] of Object.entries(ROLE_PERMISSIONS)) {
    await prisma.rolePermission.createMany({
      data: codes
        .map((c) => byCode.get(c))
        .filter((id): id is string => !!id)
        .map((permissionId) => ({ role: role as never, permissionId })),
    });
  }
}

async function createStructure(organizationId: string) {
  const regionByCode: Record<string, string> = {};
  for (const r of REGIONS) {
    const row = await prisma.region.create({
      data: { organizationId, code: r.code, name: r.name },
    });
    regionByCode[r.code] = row.id;
  }

  const clusterByCode: Record<string, string> = {};
  for (const c of CLUSTERS) {
    const row = await prisma.cluster.create({
      data: {
        organizationId,
        regionId: regionByCode[c.region],
        code: c.code,
        name: c.name,
      },
    });
    clusterByCode[c.code] = row.id;
  }

  const branchByCode: Record<string, string> = {};
  for (const b of BRANCHES) {
    const row = await prisma.branch.create({
      data: {
        organizationId,
        regionId: regionByCode[b.region],
        clusterId: clusterByCode[b.cluster],
        code: b.code,
        name: b.name,
        city: b.city,
        address: b.address,
        branchType: b.type,
        contactNumber: `+92 ${rng.int(41, 99)} ${rng.int(1000000, 9999999)}`,
        email: `${b.code.toLowerCase()}@abcbank.example`,
        openingDate: new Date(Date.UTC(rng.int(1998, 2021), rng.int(0, 11), rng.int(1, 28))),
        status: b.code === 'HYD-001' ? 'INACTIVE' : 'ACTIVE',
      },
    });
    branchByCode[b.code] = row.id;
  }

  return { regionByCode, branchByCode };
}

async function createUsers(
  organizationId: string,
  regionByCode: Record<string, string>,
  branchByCode: Record<string, string>,
) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userByKey: Record<string, { id: string; name: string }> = {};

  for (const u of USERS) {
    const row = await prisma.user.create({
      data: {
        organizationId,
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        jobTitle: u.jobTitle,
        phone: u.phone,
        regionAssignments: u.regions
          ? { create: u.regions.map((code) => ({ regionId: regionByCode[code] })) }
          : undefined,
      },
    });
    userByKey[u.key] = { id: row.id, name: row.name };
  }

  const managerByBranch: Record<string, string> = {};
  for (const m of BRANCH_MANAGERS) {
    const row = await prisma.user.create({
      data: {
        organizationId,
        email: m.email,
        name: m.name,
        passwordHash,
        role: 'BRANCH_MANAGER',
        jobTitle: 'Branch Manager',
        phone: `+92 300 ${rng.int(4000000, 4999999)}`,
        branchAssignments: { create: [{ branchId: branchByCode[m.branch] }] },
      },
    });
    managerByBranch[m.branch] = row.id;
    await prisma.branch.update({
      where: { id: branchByCode[m.branch] },
      data: { managerId: row.id },
    });
  }

  // Inspectors cover whole regions; give them explicit branch assignments too so
  // "my branches" is populated for the mobile view.
  for (const key of ['insp-1', 'insp-2', 'insp-3', 'insp-4']) {
    const def = USERS.find((u) => u.key === key)!;
    const codes = BRANCHES.filter((b) => def.regions?.includes(b.region)).map((b) => b.code);
    await prisma.userBranch.createMany({
      data: codes.map((code) => ({ userId: userByKey[key].id, branchId: branchByCode[code] })),
      skipDuplicates: true,
    });
  }

  return { userByKey, managerByBranch };
}

async function createTemplate(
  organizationId: string,
  name: string,
  description: string,
  categories: SeedCategory[],
  branchType?: string,
) {
  return prisma.inspectionTemplate.create({
    data: {
      organizationId,
      name,
      description,
      branchType: branchType ?? null,
      categories: {
        create: categories.map((c, ci) => ({
          name: c.name,
          position: ci + 1,
          weight: c.weight ?? 1,
          items: {
            create: c.items.map((it, ii) => ({
              text: it.text,
              guidance: it.guidance ?? null,
              position: ii + 1,
              weight: it.weight ?? 1,
              isMandatory: it.mandatory ?? true,
              defaultSeverity: it.severity,
              requirePhotoOnFail: true,
            })),
          },
        })),
      },
    },
    include: { categories: { include: { items: true } } },
  });
}

// ---------------------------------------------------------------------------
// Historical inspection generation
// ---------------------------------------------------------------------------

function generateTargets() {
  // A believable trajectory: start somewhere, drift upward, occasionally dip.
  const start = rng.int(64, 88);
  const out = [start];
  for (let i = 1; i < 4; i++) {
    const prev = out[i - 1];
    const delta = rng.chance(0.25) ? -rng.int(1, 5) : rng.int(1, 7);
    out.push(Math.max(58, Math.min(98, prev + delta)));
  }
  return out;
}

type PlannedResponse = {
  categoryName: string;
  itemText: string;
  weight: number;
  severity: Severity;
  position: number;
  itemIndexKey: string;
  result: ResponseResult;
};

/**
 * Chooses answers that land near a target score. Items are picked for failure by
 * weight-aware sampling so a low score is driven by meaningful items, not noise.
 */
function planResponses(
  categories: SeedCategory[],
  targetScore: number,
  forceFail: string[],
): PlannedResponse[] {
  const flat = categories.flatMap((c, ci) =>
    c.items.map((it, ii) => ({
      categoryName: c.name,
      itemText: it.text,
      weight: it.weight ?? 1,
      severity: it.severity,
      position: (ci + 1) * 1000 + (ii + 1),
      itemIndexKey: `${c.name}::${it.text}`,
    })),
  );

  // A few items are genuinely not applicable at a given branch.
  const naCandidates = ['Solar system', 'Generator', 'Pest control'];
  const na = new Set<string>();
  for (const c of naCandidates) if (rng.chance(0.22)) na.add(c);

  const applicable = flat.filter((f) => !na.has(f.itemText));
  const totalWeight = applicable.reduce((n, f) => n + f.weight, 0);

  // Weight we need to "lose" to hit the target.
  let deficit = totalWeight * (1 - targetScore / 100);

  const failed = new Set<string>();
  for (const item of forceFail) {
    const match = applicable.find((f) => f.itemText === item);
    if (match) {
      failed.add(match.itemText);
      deficit -= match.weight;
    }
  }

  // Add non-compliances until roughly two-thirds of the deficit is consumed,
  // then make up the remainder with partial answers.
  const pool = rng.shuffle(applicable.filter((f) => !failed.has(f.itemText)));
  let idx = 0;
  while (deficit > 1.5 && idx < pool.length) {
    const candidate = pool[idx++];
    if (candidate.weight <= deficit) {
      failed.add(candidate.itemText);
      deficit -= candidate.weight;
    }
  }

  const partial = new Set<string>();
  for (const candidate of pool.slice(idx)) {
    if (deficit <= 0.25) break;
    partial.add(candidate.itemText);
    deficit -= candidate.weight * 0.5;
  }

  return flat.map((f) => ({
    ...f,
    result: na.has(f.itemText)
      ? ('NOT_APPLICABLE' as ResponseResult)
      : failed.has(f.itemText)
        ? ('NON_COMPLIANT' as ResponseResult)
        : partial.has(f.itemText)
          ? ('PARTIALLY_COMPLIANT' as ResponseResult)
          : ('COMPLIANT' as ResponseResult),
  }));
}

async function createHistoricalInspection(args: {
  organizationId: string;
  branchCode: string;
  branchId: string;
  templateId: string;
  categories: SeedCategory[];
  inspectorId: string;
  assignedById: string;
  date: Date;
  targetScore: number;
  roundIndex: number;
  featured: boolean;
  managerId: string | null;
  verifierIds: string[];
}) {
  const {
    organizationId, branchId, templateId, inspectorId, assignedById,
    date, targetScore, roundIndex, featured, managerId, verifierIds, branchCode,
  } = args;

  // The recurring item fails at Multan Cantt in the first three rounds — the
  // pattern the repeat-finding detector is meant to surface.
  const forceFail =
    branchCode === 'MUL-001' && roundIndex < 3 ? [RECURRING_ITEM] : [];

  const planned = planResponses(args.categories, targetScore, forceFail);

  const items = await prisma.checklistItem.findMany({
    where: { category: { templateId } },
    include: { category: true },
  });
  const itemIdByKey = new Map(items.map((i) => [`${i.category.name}::${i.text}`, i.id]));
  const itemMeta = new Map(items.map((i) => [i.id, i]));

  const reference = await nextRef(organizationId, 'INS', date);

  const score = computeScore(
    planned.map((p) => ({ categoryName: p.categoryName, weight: p.weight, result: p.result })),
    DEFAULT_SCORING,
  );

  const inspection = await prisma.inspection.create({
    data: {
      organizationId,
      reference,
      branchId,
      templateId,
      inspectorId,
      assignedById,
      status: 'SUBMITTED',
      scheduledFor: new Date(date.getTime() - 2 * DAY),
      startedAt: new Date(date.getTime() - 3 * HOUR),
      submittedAt: date,
      score: score.score,
      earnedPoints: score.earnedPoints,
      applicablePoints: score.applicablePoints,
      totalItems: score.totalItems,
      compliantCount: score.compliantCount,
      partialCount: score.partialCount,
      nonCompliantCount: score.nonCompliantCount,
      naCount: score.naCount,
      categoryScores: score.categories as unknown as Prisma.InputJsonValue,
      summary: buildRecommendation(score, score.nonCompliantCount),
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId, actorId: assignedById, actorLabel: 'Sana Iqbal',
        action: 'inspection.assigned', entityType: 'Inspection', entityId: inspection.id,
        summary: `Assigned ${reference}`, createdAt: new Date(date.getTime() - 2 * DAY),
      },
      {
        organizationId, actorId: inspectorId, actorLabel: 'Inspector',
        action: 'inspection.started', entityType: 'Inspection', entityId: inspection.id,
        summary: `Started ${reference}`, createdAt: new Date(date.getTime() - 3 * HOUR),
      },
      {
        organizationId, actorId: inspectorId, actorLabel: 'Inspector',
        action: 'inspection.submitted', entityType: 'Inspection', entityId: inspection.id,
        summary: `Submitted ${reference} — score ${score.score}%, ${score.nonCompliantCount} finding(s) raised`,
        after: { score: score.score } as Prisma.InputJsonValue, createdAt: date,
      },
    ],
  });

  let findings = 0;

  for (const p of planned) {
    const itemId = itemIdByKey.get(p.itemIndexKey);
    if (!itemId) continue;
    const meta = itemMeta.get(itemId)!;

    const isFail = p.result === 'NON_COMPLIANT';
    const observation = isFail
      ? observationFor(p.itemText)
      : p.result === 'PARTIALLY_COMPLIANT'
        ? partialNote(p.itemText)
        : null;

    const response = await prisma.inspectionResponse.create({
      data: {
        inspectionId: inspection.id,
        checklistItemId: itemId,
        categoryName: p.categoryName,
        itemText: p.itemText,
        position: p.position,
        weight: p.weight,
        result: p.result,
        observation,
        answeredAt: new Date(date.getTime() - rng.int(30, 170) * 60 * 1000),
        severity: isFail ? meta.defaultSeverity : null,
      },
    });

    if (!isFail) continue;

    const finding = await createSeedFinding({
      organizationId,
      branchId,
      inspectionId: inspection.id,
      responseId: response.id,
      categoryName: p.categoryName,
      itemText: p.itemText,
      observation: observation!,
      severity: meta.defaultSeverity,
      createdAt: date,
      createdById: inspectorId,
      assignedToId: managerId,
      roundIndex,
      featured,
      verifierIds,
    });
    findings += 1;

    await attachEvidence(organizationId, {
      responseId: response.id,
      findingId: finding.id,
      kind: 'BEFORE',
      uploadedById: inspectorId,
      capturedAt: date,
      caption: `${p.itemText} — condition observed during inspection`,
      count: rng.int(1, 3),
    });

    if (finding.status === 'CLOSED' || finding.status === 'UNDER_VERIFICATION') {
      await attachEvidence(organizationId, {
        findingId: finding.id,
        correctiveActionId: finding.correctiveActionId,
        kind: 'AFTER',
        uploadedById: managerId ?? inspectorId,
        capturedAt: finding.evidenceSubmittedAt ?? date,
        caption: `${p.itemText} — corrective action completed`,
        count: rng.int(1, 2),
      });
    }
  }

  return { findings, score: score.score };
}

function partialNote(item: string) {
  return `${item} is partially compliant — the arrangement is in place but does not fully meet the standard and should be corrected before it deteriorates.`;
}

/**
 * Creates a finding whose lifecycle position matches its age: old findings are
 * mostly closed, recent ones are still moving, and a deliberate slice is left
 * overdue so the escalation views have real data.
 */
async function createSeedFinding(args: {
  organizationId: string;
  branchId: string;
  inspectionId: string;
  responseId: string;
  categoryName: string;
  itemText: string;
  observation: string;
  severity: Severity;
  createdAt: Date;
  createdById: string;
  assignedToId: string | null;
  roundIndex: number;
  featured: boolean;
  verifierIds: string[];
}) {
  const dueHours = DEFAULT_SEVERITY_HOURS[args.severity];
  const dueDate = new Date(args.createdAt.getTime() + dueHours * HOUR);
  const ageDays = (NOW.getTime() - args.createdAt.getTime()) / DAY;

  // Older findings have had time to be closed; the newest round is still live.
  let status: FindingStatus;
  if (ageDays > 120) status = rng.chance(0.93) ? 'CLOSED' : 'IN_PROGRESS';
  else if (ageDays > 60) status = rng.chance(0.82) ? 'CLOSED' : rng.pick(['IN_PROGRESS', 'UNDER_VERIFICATION'] as const);
  else if (ageDays > 20) status = rng.chance(0.55) ? 'CLOSED' : rng.pick(['IN_PROGRESS', 'UNDER_VERIFICATION', 'ASSIGNED'] as const);
  else status = rng.pick(['ASSIGNED', 'IN_PROGRESS', 'UNDER_VERIFICATION', 'CLOSED', 'IN_PROGRESS'] as const);

  const number = await nextRef(args.organizationId, 'BR', args.createdAt);

  const closedAt =
    status === 'CLOSED'
      ? new Date(
          Math.min(
            NOW.getTime() - rng.int(1, 10) * DAY,
            args.createdAt.getTime() + rng.int(1, Math.max(2, Math.round(dueHours / 12))) * DAY,
          ),
        )
      : null;

  const evidenceSubmittedAt =
    status === 'UNDER_VERIFICATION'
      ? new Date(NOW.getTime() - rng.int(1, 6) * DAY)
      : closedAt
        ? new Date(closedAt.getTime() - rng.int(1, 3) * DAY)
        : null;

  const rejectionCount = rng.chance(0.18) ? 1 : 0;
  const verifierId = rng.pick(args.verifierIds);

  const finding = await prisma.finding.create({
    data: {
      organizationId: args.organizationId,
      number,
      branchId: args.branchId,
      inspectionId: args.inspectionId,
      responseId: args.responseId,
      categoryName: args.categoryName,
      itemText: args.itemText,
      observation: args.observation,
      severity: args.severity,
      status,
      assignedToId: args.assignedToId,
      createdById: args.createdById,
      dueDate,
      createdAt: args.createdAt,
      startedAt: status === 'ASSIGNED' ? null : new Date(args.createdAt.getTime() + rng.int(2, 30) * HOUR),
      evidenceSubmittedAt,
      closedAt,
      closedById: closedAt ? verifierId : null,
      closureNote: closedAt ? 'Corrective action verified against submitted evidence.' : null,
      rejectionCount,
      recurrenceKey: '', // filled by flagRecurrence()
    },
  });

  let correctiveActionId: string | null = null;

  // Rejected first attempt, where applicable, then the accepted/pending one.
  let attempt = 0;
  if (rejectionCount > 0 && evidenceSubmittedAt) {
    attempt += 1;
    await prisma.correctiveAction.create({
      data: {
        findingId: finding.id,
        attempt,
        description: 'Initial rectification carried out by the branch maintenance vendor.',
        submittedById: args.assignedToId ?? args.createdById,
        submittedAt: new Date(evidenceSubmittedAt.getTime() - 4 * DAY),
        verdict: 'REJECTED',
        verifiedById: verifierId,
        verifiedAt: new Date(evidenceSubmittedAt.getTime() - 3 * DAY),
        verifierComment:
          'Uploaded photo does not clearly show the corrected condition. Please re-submit a close-up taken in adequate light.',
      },
    });
  }

  if (evidenceSubmittedAt) {
    attempt += 1;
    const ca = await prisma.correctiveAction.create({
      data: {
        findingId: finding.id,
        attempt,
        description: correctiveDescription(args.itemText),
        actionTaken: 'Work completed and re-checked by the branch manager.',
        submittedById: args.assignedToId ?? args.createdById,
        submittedAt: evidenceSubmittedAt,
        verdict: closedAt ? 'ACCEPTED' : 'PENDING',
        verifiedById: closedAt ? verifierId : null,
        verifiedAt: closedAt,
        verifierComment: closedAt ? 'Evidence is clear and the condition is corrected. Closed.' : null,
      },
    });
    correctiveActionId = ca.id;
  }

  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: args.organizationId, actorId: args.createdById, actorLabel: 'Inspector',
        action: 'finding.created', entityType: 'Finding', entityId: finding.id,
        summary: `Raised ${number} (${args.severity}) — ${args.itemText}`, createdAt: args.createdAt,
      },
      ...(evidenceSubmittedAt
        ? [{
            organizationId: args.organizationId, actorId: args.assignedToId ?? args.createdById,
            actorLabel: 'Branch Manager', action: 'finding.evidence_submitted',
            entityType: 'Finding', entityId: finding.id,
            summary: `${number}: corrective evidence submitted`, createdAt: evidenceSubmittedAt,
          }]
        : []),
      ...(closedAt
        ? [{
            organizationId: args.organizationId, actorId: verifierId, actorLabel: 'Verifier',
            action: 'finding.evidence_accepted', entityType: 'Finding', entityId: finding.id,
            summary: `${number} verified and closed`, createdAt: closedAt,
          }]
        : []),
    ],
  });

  return { ...finding, correctiveActionId };
}

function correctiveDescription(item: string) {
  const map: Record<string, string> = {
    'Fire exit access': 'Stored cartons and the spare desk have been removed from the escape route and relocated to the approved store. The path is now clear along its full width.',
    'Cable management': 'DB internal wiring re-dressed with ferrules and cable ties, and routed through trunking by the approved electrical contractor.',
    'Fire extinguisher expiry': 'Both extinguishers refilled and pressure-tested by the licensed vendor; new service tags fitted.',
    'Water leakage': 'Roof slab treated and re-waterproofed above the records room; monitored for two weeks with no recurrence.',
  };
  return (
    map[item] ??
    `Corrective action completed for "${item}". The deficiency has been rectified and re-checked at the branch.`
  );
}

/**
 * Placeholder evidence images are drawn from a small pre-rendered pool. Encoding
 * a unique PNG per evidence row cost minutes of seed time for no demo value;
 * each row still gets its own stored object and checksum.
 */
const IMAGE_POOL: Record<'BEFORE' | 'AFTER', Buffer[]> = { BEFORE: [], AFTER: [] };

function buildImagePool() {
  for (let i = 0; i < 12; i++) {
    IMAGE_POOL.BEFORE.push(placeholderPng(1024, 768, BEFORE_PALETTE[0], BEFORE_PALETTE[1], 1000 + i));
    IMAGE_POOL.AFTER.push(placeholderPng(1024, 768, AFTER_PALETTE[0], AFTER_PALETTE[1], 2000 + i));
  }
}

function pooledImage(kind: 'BEFORE' | 'AFTER' | 'INSPECTION' | 'VERIFICATION') {
  const bucket = kind === 'AFTER' ? IMAGE_POOL.AFTER : IMAGE_POOL.BEFORE;
  return bucket[rng.int(0, bucket.length - 1)];
}

async function attachEvidence(
  organizationId: string,
  args: {
    responseId?: string;
    findingId?: string;
    correctiveActionId?: string | null;
    kind: 'BEFORE' | 'AFTER' | 'INSPECTION' | 'VERIFICATION';
    uploadedById: string;
    capturedAt: Date;
    caption: string;
    count: number;
  },
) {
  for (let i = 0; i < args.count; i++) {
    const png = pooledImage(args.kind);
    const stored = await storeEvidence(organizationId, 'evidence', png, 'image/png');

    await prisma.evidence.create({
      data: {
        organizationId,
        responseId: args.responseId ?? null,
        findingId: args.findingId ?? null,
        correctiveActionId: args.correctiveActionId ?? null,
        kind: args.kind,
        mediaType: 'PHOTO',
        storageKey: stored.key,
        fileName: `${args.kind.toLowerCase()}-${i + 1}.png`,
        mimeType: 'image/png',
        sizeBytes: stored.size,
        checksum: stored.checksum,
        caption: args.count > 1 ? `${args.caption} (${i + 1}/${args.count})` : args.caption,
        capturedAt: args.capturedAt,
        latitude: 30.1575 + (rng.next() - 0.5) * 4,
        longitude: 71.5249 + (rng.next() - 0.5) * 4,
        uploadedById: args.uploadedById,
      },
    });
  }
}

/** An inspection left mid-flight so the runner UI has live data to open. */
async function createOpenInspection(
  organizationId: string,
  branchId: string,
  templateId: string,
  inspectorId: string,
  assignedById: string,
  status: 'IN_PROGRESS' | 'ASSIGNED' = 'IN_PROGRESS',
) {
  const template = await prisma.inspectionTemplate.findUnique({
    where: { id: templateId },
    include: {
      categories: { orderBy: { position: 'asc' }, include: { items: { orderBy: { position: 'asc' } } } },
    },
  });
  if (!template) return;

  const items = template.categories.flatMap((c) => c.items.map((i) => ({ c, i })));
  const reference = await nextRef(organizationId, 'INS', NOW);

  const inspection = await prisma.inspection.create({
    data: {
      organizationId,
      reference,
      branchId,
      templateId,
      inspectorId,
      assignedById,
      status,
      scheduledFor: new Date(NOW.getTime() + (status === 'ASSIGNED' ? 3 * DAY : -2 * HOUR)),
      startedAt: status === 'IN_PROGRESS' ? new Date(NOW.getTime() - 2 * HOUR) : null,
      totalItems: items.length,
      templateSnapshot: {
        id: template.id,
        name: template.name,
        version: template.version,
        categories: template.categories.map((c) => ({
          id: c.id, name: c.name, position: c.position, weight: c.weight,
          items: c.items.map((i) => ({
            id: i.id, text: i.text, guidance: i.guidance, position: i.position,
            weight: i.weight, isMandatory: i.isMandatory,
            defaultSeverity: i.defaultSeverity, requirePhotoOnFail: i.requirePhotoOnFail,
          })),
        })),
      } as Prisma.InputJsonValue,
    },
  });

  // Answer roughly the first half so the progress bar is meaningful.
  const answeredThrough = status === 'IN_PROGRESS' ? Math.floor(items.length * 0.48) : 0;

  await prisma.inspectionResponse.createMany({
    data: items.map(({ c, i }, idx) => ({
      inspectionId: inspection.id,
      checklistItemId: i.id,
      categoryName: c.name,
      itemText: i.text,
      position: c.position * 1000 + i.position,
      weight: i.weight,
      result: idx < answeredThrough ? (rng.chance(0.85) ? 'COMPLIANT' : 'PARTIALLY_COMPLIANT') : null,
      answeredAt: idx < answeredThrough ? new Date(NOW.getTime() - rng.int(10, 110) * 60000) : null,
    })),
  });

  return inspection;
}

// ---------------------------------------------------------------------------

/**
 * Computes recurrence keys and flags repeat findings, mirroring what the
 * application does at creation time.
 */
async function flagRecurrence(organizationId: string) {
  const { recurrenceKey } = await import('../src/lib/domain/recurrence');
  const findings = await prisma.finding.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, branchId: true, itemText: true },
  });

  const counts = new Map<string, number>();
  for (const f of findings) {
    const key = recurrenceKey(f.branchId, f.itemText);
    const n = (counts.get(key) ?? 0) + 1;
    counts.set(key, n);
    await prisma.finding.update({
      where: { id: f.id },
      data: { recurrenceKey: key, recurrenceCount: n },
    });
  }

  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId } });
  const threshold = settings?.recurrenceThreshold ?? 3;
  const recurringKeys = [...counts.entries()]
    .filter(([, n]) => n >= threshold)
    .map(([k]) => k);
  const res = await prisma.finding.updateMany({
    where: { organizationId, recurrenceKey: { in: recurringKeys } },
    data: { isRecurring: true },
  });
  return res.count;
}

async function seedNotifications(organizationId: string) {
  const recent = await prisma.finding.findMany({
    where: { organizationId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    orderBy: { createdAt: 'desc' },
    take: 24,
    include: { branch: { select: { name: true } } },
  });

  for (const f of recent) {
    const recipients = [f.assignedToId].filter((v): v is string => !!v);
    if (recipients.length === 0) continue;

    // Overdue and due-soon alerts come from the escalation sweep, not from here.
    await prisma.notification.create({
      data: {
        organizationId,
        userId: recipients[0],
        type: f.severity === 'CRITICAL' ? 'FINDING_CREATED' : 'FINDING_ASSIGNED',
        level: f.severity === 'CRITICAL' ? 'CRITICAL' : 'INFO',
        title: f.severity === 'CRITICAL' ? `Critical finding ${f.number}` : `Assigned to you: ${f.number}`,
        body: `${f.branch.name} — ${f.itemText}`,
        link: `/findings/${f.id}`,
        entityType: 'Finding',
        entityId: f.id,
        readAt: rng.chance(0.35) ? new Date(NOW.getTime() - rng.int(1, 40) * HOUR) : null,
        createdAt: new Date(Math.max(f.createdAt.getTime(), NOW.getTime() - rng.int(1, 30) * DAY)),
      },
    });
  }
}

/** Sequential reference numbers scoped to the year of the record. */
const refCounters = new Map<string, number>();
async function nextRef(organizationId: string, prefix: string, date: Date) {
  const key = `${organizationId}:${prefix}:${date.getUTCFullYear()}`;
  const next = (refCounters.get(key) ?? 0) + 1;
  refCounters.set(key, next);
  return `${prefix}-${date.getUTCFullYear()}-${String(next).padStart(5, '0')}`;
}

async function summary(organizationId: string) {
  const [branches, users, submitted, open, overdue, critical, closed, evidence] = await Promise.all([
    prisma.branch.count({ where: { organizationId } }),
    prisma.user.count({ where: { organizationId } }),
    prisma.inspection.count({ where: { organizationId, status: 'SUBMITTED' } }),
    prisma.finding.count({ where: { organizationId, status: { notIn: ['CLOSED', 'CANCELLED'] } } }),
    prisma.finding.count({
      where: { organizationId, status: { notIn: ['CLOSED', 'CANCELLED'] }, dueDate: { lt: NOW } },
    }),
    prisma.finding.count({
      where: { organizationId, severity: 'CRITICAL', status: { notIn: ['CLOSED', 'CANCELLED'] } },
    }),
    prisma.finding.count({ where: { organizationId, status: 'CLOSED' } }),
    prisma.evidence.count({ where: { organizationId } }),
  ]);
  return { branches, users, submitted, open, overdue, critical, closed, evidence };
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
