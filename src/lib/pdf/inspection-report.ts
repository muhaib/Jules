import 'server-only';

import PDFDocument from 'pdfkit';

import { prisma } from '@/lib/db';
import { storage } from '@/lib/storage';
import { orgConfig } from '@/lib/domain/settings';
import { BAND_LABELS, bandFor } from '@/lib/domain/scoring';
import { deadlineState, describeRemaining } from '@/lib/domain/deadlines';
import { FINDING_STATUS_LABELS } from '@/lib/domain/findings';
import { fmtDate, fmtDateTime, RESULT_LABEL, SEVERITY_LABEL } from '@/lib/format';
import { CONTENT_WIDTH, PAGE, PDF, scoreColor, severityColor } from '@/lib/pdf/theme';
import { finish, Layout, paginate, type Doc } from '@/lib/pdf/builder';
import type { OrgConfig } from '@/lib/domain/settings';

/** Everything the report renders, derived from the single query below. */
type ReportData = NonNullable<Awaited<ReturnType<typeof loadInspection>>>;
type ReportFinding = ReportData['findings'][number];
type ReportEvidence = ReportFinding['evidence'][number];

/** Category rollup stored on the inspection at submission time. */
type CategoryScoreRow = {
  name: string;
  score: number | null;
  compliant: number;
  partial: number;
  nonCompliant: number;
  na: number;
  total: number;
};

/**
 * Full inspection report.
 *
 * Structure follows what a facilities committee actually needs to act on:
 * cover, executive summary, category performance, every finding with its
 * photographic evidence and owner, corrective-action status, then a
 * recommendation.
 */
function loadInspection(inspectionId: string, organizationId: string) {
  return prisma.inspection.findFirst({
    where: { id: inspectionId, organizationId },
    include: {
      organization: { select: { name: true, legalName: true } },
      branch: { select: { name: true, code: true, city: true, address: true, branchType: true } },
      template: { select: { name: true, version: true } },
      inspector: { select: { name: true, jobTitle: true } },
      assignedBy: { select: { name: true } },
      responses: { orderBy: { position: 'asc' } },
      findings: {
        orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
        include: {
          assignedTo: { select: { name: true } },
          evidence: { orderBy: { capturedAt: 'asc' } },
        },
      },
    },
  });

}

export async function buildInspectionReport(inspectionId: string, organizationId: string) {
  const inspection = await loadInspection(inspectionId, organizationId);
  if (!inspection) return null;

  const cfg = await orgConfig(organizationId);
  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE.margin,
    bufferPages: true,
    info: {
      Title: `Inspection Report ${inspection.reference}`,
      Author: inspection.organization.name,
      Subject: `${inspection.branch.name} facility compliance inspection`,
    },
  }) as Doc;

  const L = new Layout(doc);
  const orgName = inspection.organization.name;

  cover(doc, L, inspection, cfg);
  doc.addPage();
  executiveSummary(doc, L, inspection);
  categoryPerformance(doc, L, inspection, cfg);
  await detailedFindings(doc, L, inspection, cfg);
  correctiveActionSummary(doc, L, inspection);
  recommendation(doc, L, inspection);
  fullChecklist(doc, L, inspection);

  paginate(doc, orgName);
  return { buffer: await finish(doc), reference: inspection.reference };
}

// ---------------------------------------------------------------------------

function cover(doc: Doc, L: Layout, i: ReportData, cfg: OrgConfig) {
  const band = bandFor(i.score, cfg);

  // Header band
  doc.rect(0, 0, PAGE.width, 132).fill(PDF.accent);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF.white)
    .text('BRANCHCHECK', PAGE.margin, 40, { characterSpacing: 2 });
  doc.font('Helvetica-Bold').fontSize(22).fillColor(PDF.white)
    .text('Facility Inspection Report', PAGE.margin, 60, { width: CONTENT_WIDTH });
  doc.font('Helvetica').fontSize(10).fillColor('#C7D8EE')
    .text(i.organization.legalName ?? i.organization.name, PAGE.margin, 92);

  doc.y = 170;
  doc.x = PAGE.margin;

  // Score block — the headline number
  const boxHeight = 96;
  doc.rect(PAGE.margin, doc.y, CONTENT_WIDTH, boxHeight).fill(PDF.raised);
  const boxY = doc.y;

  doc.font('Helvetica').fontSize(8).fillColor(PDF.faint)
    .text('OVERALL COMPLIANCE SCORE', PAGE.margin + 18, boxY + 18, { characterSpacing: 0.6 });
  doc.font('Helvetica-Bold').fontSize(40).fillColor(scoreColor(i.score))
    .text(i.score === null ? '—' : `${i.score.toFixed(1)}%`, PAGE.margin + 18, boxY + 34);
  doc.font('Helvetica-Bold').fontSize(12).fillColor(PDF.ink)
    .text(band ? BAND_LABELS[band] : '—', PAGE.margin + 18, boxY + 76);

  // Answer breakdown on the right
  const rightX = PAGE.margin + CONTENT_WIDTH / 2 + 20;
  const stats: [string, number, string][] = [
    ['Compliant', i.compliantCount, PDF.ok],
    ['Partially compliant', i.partialCount, PDF.warn],
    ['Non-compliant', i.nonCompliantCount, PDF.bad],
    ['Not applicable', i.naCount, PDF.muted],
  ];
  stats.forEach(([label, value, color], idx) => {
    const y = boxY + 18 + idx * 17;
    doc.font('Helvetica').fontSize(9).fillColor(PDF.muted).text(label, rightX, y, { width: 150 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(color)
      .text(String(value), rightX + 150, y, { width: 40, align: 'right' });
  });

  doc.y = boxY + boxHeight + 26;
  doc.x = PAGE.margin;

  L.keyValues([
    ['Organization', i.organization.name],
    ['Report reference', i.reference],
    ['Branch name', i.branch.name],
    ['Branch code', i.branch.code],
    ['Branch type', i.branch.branchType],
    ['City', i.branch.city],
    ['Inspection date', fmtDate(i.submittedAt ?? i.scheduledFor)],
    ['Inspector', i.inspector.name],
    ['Template', `${i.template.name} (v${i.template.version})`],
    ['Assigned by', i.assignedBy?.name ?? '—'],
    ['Findings raised', String(i.findings.length)],
    ['Report generated', fmtDateTime(new Date())],
  ]);

  L.gap(14);
  doc.font('Helvetica').fontSize(8).fillColor(PDF.faint).text(i.branch.address, PAGE.margin, doc.y, {
    width: CONTENT_WIDTH,
  });

  L.gap(20);
  L.callout(
    'How this score is calculated',
    `Compliance Score = Earned Points ÷ Applicable Points × 100. Compliant answers earn ${cfg.scoreCompliant}% of an item's weight, partially compliant ${cfg.scorePartial}%, and non-compliant ${cfg.scoreNonCompliant}%. Items marked Not Applicable are excluded from both sides of the calculation, so a branch is never penalised for equipment it does not have. This inspection earned ${i.earnedPoints ?? 0} of ${i.applicablePoints ?? 0} applicable points.`,
    PDF.accent,
    PDF.accentSoft,
  );
}

// ---------------------------------------------------------------------------

function executiveSummary(doc: Doc, L: Layout, i: ReportData) {
  L.sectionTitle('Executive summary');

  const open = i.findings.filter((f) => !['CLOSED', 'CANCELLED'].includes(f.status)).length;
  const critical = i.findings.filter((f) => f.severity === 'CRITICAL').length;
  const high = i.findings.filter((f) => f.severity === 'HIGH').length;

  L.table(
    [
      { header: 'Measure', width: CONTENT_WIDTH - 110 },
      { header: 'Value', width: 110, align: 'right' },
    ],
    [
      { cells: ['Total checklist items', String(i.totalItems)] },
      { cells: ['Compliant', String(i.compliantCount)], colors: [undefined, PDF.ok] },
      { cells: ['Partially compliant', String(i.partialCount)], colors: [undefined, PDF.warn] },
      { cells: ['Non-compliant', String(i.nonCompliantCount)], colors: [undefined, PDF.bad] },
      { cells: ['Not applicable (excluded from score)', String(i.naCount)] },
      { cells: ['Findings raised', String(i.findings.length)], bold: true },
      { cells: ['Critical findings', String(critical)], colors: [undefined, PDF.crit], bold: critical > 0 },
      { cells: ['High findings', String(high)], colors: [undefined, PDF.bad] },
      { cells: ['Findings still open', String(open)], colors: [undefined, open > 0 ? PDF.warn : PDF.ok], bold: true },
    ],
  );

  if (critical > 0) {
    L.gap(4);
    L.callout(
      `${critical} critical finding${critical === 1 ? '' : 's'} require immediate action`,
      'A critical finding represents an immediate safety, security or business risk. These carry the shortest remediation deadline and escalate fastest if they are not closed with verified evidence.',
      PDF.crit,
      '#FBEAF0',
    );
  }
}

function categoryPerformance(doc: Doc, L: Layout, i: ReportData, cfg: OrgConfig) {
  const categories = (i.categoryScores as CategoryScoreRow[] | null) ?? [];
  if (categories.length === 0) return;

  L.gap(8);
  L.sectionTitle('Category performance');
  L.body(
    'Category scores show exactly where the branch is weak, rather than hiding a poor area inside a good overall average.',
    { color: PDF.muted, size: 9 },
  );
  L.gap(8);

  const w = [CONTENT_WIDTH - 320, 70, 62, 62, 62, 64];
  L.table(
    [
      { header: 'Category', width: w[0] },
      { header: 'Score', width: w[1], align: 'right' },
      { header: 'Compliant', width: w[2], align: 'right' },
      { header: 'Partial', width: w[3], align: 'right' },
      { header: 'Non-comp.', width: w[4], align: 'right' },
      { header: 'N/A', width: w[5], align: 'right' },
    ],
    categories.map((c) => ({
      cells: [
        c.name,
        c.score === null ? '—' : `${c.score.toFixed(1)}%`,
        String(c.compliant),
        String(c.partial),
        String(c.nonCompliant),
        String(c.na),
      ],
      colors: [undefined, scoreColor(c.score), PDF.ok, PDF.warn, PDF.bad, PDF.muted],
    })),
  );

  const scored = categories.filter(
    (c): c is CategoryScoreRow & { score: number } => c.score !== null,
  );
  const weakest = [...scored].sort((a, b) => a.score - b.score)[0];
  if (weakest && weakest.score < cfg.bandGood) {
    L.callout(
      `Weakest area: ${weakest.name} (${weakest.score.toFixed(1)}%)`,
      `This category scored below the ${cfg.bandGood}% "Good" threshold and should be the focus of the branch's remediation effort.`,
      PDF.warn,
      '#FCF4E4',
    );
  }
}

// ---------------------------------------------------------------------------

async function detailedFindings(doc: Doc, L: Layout, i: ReportData, cfg: OrgConfig) {
  doc.addPage();
  L.sectionTitle('Detailed findings');

  if (i.findings.length === 0) {
    L.body('No non-compliances were recorded during this inspection.', { color: PDF.muted });
    return;
  }

  L.body(
    'Each finding below carries a severity, a responsible person, a deadline and photographic evidence. A finding is only closed once a verifier has accepted evidence that the correction was actually made.',
    { color: PDF.muted, size: 9 },
  );
  L.gap(12);

  for (const f of i.findings) {
    L.ensure(200);

    const startY = doc.y;

    // Finding header: number + severity + status
    doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF.ink).text(f.number, PAGE.margin, startY);
    const numberWidth = doc.widthOfString(f.number) + 10;
    let pillX = PAGE.margin + numberWidth;
    pillX += L.pill(SEVERITY_LABEL[f.severity].toUpperCase(), severityColor(f.severity), pillX, startY + 1) + 5;

    const state = deadlineState(f, cfg.dueSoonHours);
    const stateColor = state === 'OVERDUE' ? PDF.bad : state === 'DUE_SOON' ? PDF.warn : state === 'CLOSED' ? PDF.ok : PDF.muted;
    L.pill(FINDING_STATUS_LABELS[f.status].toUpperCase(), stateColor, pillX, startY + 1);

    doc.y = startY + 20;
    doc.x = PAGE.margin;

    if (f.isRecurring) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PDF.crit).text(
        `RECURRING — this item has failed ${f.recurrenceCount} times at this branch. Management attention required.`,
        PAGE.margin,
        doc.y,
        { width: CONTENT_WIDTH },
      );
      L.gap(4);
    }

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PDF.ink)
      .text(`${f.categoryName} — ${f.itemText}`, PAGE.margin, doc.y, { width: CONTENT_WIDTH });
    L.gap(3);
    doc.font('Helvetica').fontSize(9).fillColor(PDF.muted)
      .text(f.observation, PAGE.margin, doc.y, { width: CONTENT_WIDTH, lineGap: 1.5 });
    L.gap(8);

    L.table(
      [
        { header: 'Responsible person', width: CONTENT_WIDTH * 0.34 },
        { header: 'Due date', width: CONTENT_WIDTH * 0.22 },
        { header: 'Deadline', width: CONTENT_WIDTH * 0.24 },
        { header: 'Evidence', width: CONTENT_WIDTH * 0.2, align: 'right' },
      ],
      [
        {
          cells: [
            f.assignedTo?.name ?? 'Unassigned',
            fmtDate(f.dueDate),
            describeRemaining(f.dueDate, f.status),
            `${f.evidence.length} file(s)`,
          ],
          colors: [f.assignedTo ? undefined : PDF.bad, undefined, stateColor, undefined],
        },
      ],
    );

    await embedEvidence(doc, L, f.evidence);

    L.gap(6);
    doc
      .moveTo(PAGE.margin, doc.y)
      .lineTo(PAGE.margin + CONTENT_WIDTH, doc.y)
      .lineWidth(0.5)
      .strokeColor(PDF.line)
      .stroke();
    L.gap(14);
  }
}

/**
 * Embeds up to four photos per finding, paired before/after. Images are drawn
 * from the object store at full stored resolution — pdfkit scales them for the
 * page without re-encoding the source.
 */
async function embedEvidence(doc: Doc, L: Layout, evidence: ReportEvidence[]) {
  const photos = evidence.filter((e) => e.mediaType === 'PHOTO');
  if (photos.length === 0) return;

  const before = photos.filter((e) => e.kind === 'BEFORE' || e.kind === 'INSPECTION').slice(0, 2);
  const after = photos.filter((e) => e.kind === 'AFTER' || e.kind === 'VERIFICATION').slice(0, 2);
  const selected = [...before, ...after];
  if (selected.length === 0) return;

  // A lone photo must not balloon to the full page width. Two columns keeps a
  // single image large enough to actually show the defect without dominating
  // the page; four keeps a full before/after set on one row.
  const cols = selected.length <= 2 ? 2 : 4;
  const gap = 8;
  const cellWidth = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
  const cellHeight = cellWidth * 0.72;

  L.ensure(cellHeight + 34);
  const y = doc.y;

  for (let idx = 0; idx < selected.length; idx++) {
    const item = selected[idx];
    const x = PAGE.margin + idx * (cellWidth + gap);
    const isAfter = item.kind === 'AFTER' || item.kind === 'VERIFICATION';

    doc.font('Helvetica-Bold').fontSize(7).fillColor(isAfter ? PDF.ok : PDF.bad)
      .text(isAfter ? 'AFTER' : 'BEFORE', x, y, { width: cellWidth, characterSpacing: 0.5 });

    try {
      const buffer = await storage().get(item.storageKey);
      doc.image(buffer, x, y + 10, { fit: [cellWidth, cellHeight], align: 'center', valign: 'center' });
      doc.rect(x, y + 10, cellWidth, cellHeight).lineWidth(0.5).strokeColor(PDF.line).stroke();
    } catch {
      // A missing file must not break the report.
      doc.rect(x, y + 10, cellWidth, cellHeight).fillAndStroke(PDF.raised, PDF.line);
      doc.font('Helvetica').fontSize(7).fillColor(PDF.faint)
        .text('Image unavailable', x, y + 10 + cellHeight / 2 - 4, { width: cellWidth, align: 'center' });
    }

    if (item.caption) {
      doc.font('Helvetica').fontSize(6.5).fillColor(PDF.faint)
        .text(item.caption, x, y + cellHeight + 13, { width: cellWidth, height: 16, ellipsis: true });
    }
  }

  doc.y = y + cellHeight + 30;
  doc.x = PAGE.margin;
}

// ---------------------------------------------------------------------------

function correctiveActionSummary(doc: Doc, L: Layout, i: ReportData) {
  L.ensure(160);
  L.gap(6);
  L.sectionTitle('Corrective action summary');

  const now = new Date();
  const findings = i.findings;
  const counts = {
    open: findings.filter((f) => ['OPEN', 'ASSIGNED'].includes(f.status)).length,
    inProgress: findings.filter((f) => ['IN_PROGRESS', 'EVIDENCE_SUBMITTED', 'REJECTED'].includes(f.status)).length,
    verification: findings.filter((f) => f.status === 'UNDER_VERIFICATION').length,
    overdue: findings.filter((f) => !['CLOSED', 'CANCELLED'].includes(f.status) && f.dueDate < now).length,
    closed: findings.filter((f) => f.status === 'CLOSED').length,
  };

  L.table(
    [
      { header: 'Corrective action state', width: CONTENT_WIDTH - 110 },
      { header: 'Findings', width: 110, align: 'right' },
    ],
    [
      { cells: ['Open / assigned, not yet started', String(counts.open)], colors: [undefined, PDF.bad] },
      { cells: ['In progress (including rework after rejection)', String(counts.inProgress)], colors: [undefined, PDF.warn] },
      { cells: ['Awaiting verification', String(counts.verification)], colors: [undefined, PDF.accent] },
      { cells: ['Overdue', String(counts.overdue)], colors: [undefined, counts.overdue > 0 ? PDF.bad : PDF.ok], bold: counts.overdue > 0 },
      { cells: ['Closed — evidence verified', String(counts.closed)], colors: [undefined, PDF.ok], bold: true },
    ],
  );
}

function recommendation(doc: Doc, L: Layout, i: ReportData) {
  if (!i.summary) return;
  L.gap(6);
  L.sectionTitle('Final recommendation');
  L.callout('Assessment', i.summary, PDF.accent, PDF.accentSoft);
}

function fullChecklist(doc: Doc, L: Layout, i: ReportData) {
  doc.addPage();
  L.sectionTitle('Complete checklist record');
  L.body('Every item assessed during this inspection, in the order it was completed.', {
    color: PDF.muted,
    size: 9,
  });
  L.gap(8);

  const byCategory: { name: string; rows: ReportData['responses'] }[] = [];
  for (const r of i.responses) {
    let cat = byCategory.find((c) => c.name === r.categoryName);
    if (!cat) {
      cat = { name: r.categoryName, rows: [] };
      byCategory.push(cat);
    }
    cat.rows.push(r);
  }

  for (const cat of byCategory) {
    L.ensure(70);
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PDF.accent)
      .text(cat.name, PAGE.margin, doc.y, { width: CONTENT_WIDTH });
    L.gap(5);

    L.table(
      [
        { header: 'Checklist item', width: CONTENT_WIDTH - 200 },
        { header: 'Result', width: 100 },
        { header: 'Observation', width: 100 },
      ],
      cat.rows.map((r) => ({
        cells: [
          r.itemText,
          r.result ? RESULT_LABEL[r.result] : 'Not answered',
          r.observation ? 'Recorded' : '—',
        ],
        colors: [
          undefined,
          r.result === 'COMPLIANT'
            ? PDF.ok
            : r.result === 'PARTIALLY_COMPLIANT'
              ? PDF.warn
              : r.result === 'NON_COMPLIANT'
                ? PDF.bad
                : PDF.muted,
          undefined,
        ],
      })),
    );
    L.gap(6);
  }
}
