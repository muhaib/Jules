import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound as nextNotFound } from 'next/navigation';

import { prisma } from '@/lib/db';
import { inspectionScope, requirePage } from '@/lib/auth/guard';
import { orgConfig } from '@/lib/domain/settings';
import { BAND_LABELS, bandFor } from '@/lib/domain/scoring';
import { deadlineState, describeRemaining } from '@/lib/domain/deadlines';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { str, type SearchParams } from '@/lib/filters';
import { Card, EmptyState, Field, PageHeader, Stat, TableWrap } from '@/components/ui/shell';
import {
  DeadlineBadge,
  FindingStatusBadge,
  InspectionStatusBadge,
  ResultBadge,
  ScoreBadge,
  SeverityBadge,
} from '@/components/ui/badges';
import { CategoryScoreChart } from '@/components/charts/dashboard-charts';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const i = await prisma.inspection.findUnique({ where: { id }, select: { reference: true } });
  return { title: i?.reference ?? 'Inspection' };
}

export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePage('inspection:view');
  const { id } = await params;
  const query = await searchParams;
  const cfg = await orgConfig(user.organizationId);
  const scope = await inspectionScope(user);

  const inspection = await prisma.inspection.findFirst({
    where: { ...scope, id },
    include: {
      branch: { select: { id: true, name: true, code: true, city: true, address: true } },
      template: { select: { name: true } },
      inspector: { select: { name: true, email: true } },
      assignedBy: { select: { name: true } },
      responses: {
        orderBy: { position: 'asc' },
        include: { _count: { select: { evidence: true } } },
      },
      findings: {
        orderBy: [{ severity: 'asc' }],
        include: { assignedTo: { select: { name: true } } },
      },
    },
  });

  if (!inspection) nextNotFound();

  const submitted = inspection.status === 'SUBMITTED';
  const categoryScores =
    (inspection.categoryScores as
      | { name: string; score: number | null; compliant: number; partial: number; nonCompliant: number; na: number; total: number }[]
      | null) ?? [];

  const band = bandFor(inspection.score, cfg);
  const answered = inspection.responses.filter((r) => r.result).length;

  const openFindings = inspection.findings.filter(
    (f) => f.status !== 'CLOSED' && f.status !== 'CANCELLED',
  ).length;
  const closedFindings = inspection.findings.filter((f) => f.status === 'CLOSED').length;
  const overdueFindings = inspection.findings.filter(
    (f) => f.status !== 'CLOSED' && f.status !== 'CANCELLED' && f.dueDate < new Date(),
  ).length;

  const canRun =
    inspection.inspectorId === user.id &&
    (inspection.status === 'ASSIGNED' || inspection.status === 'IN_PROGRESS');

  // Group responses by category for the detailed section.
  const byCategory: { name: string; responses: typeof inspection.responses }[] = [];
  for (const r of inspection.responses) {
    let cat = byCategory.find((c) => c.name === r.categoryName);
    if (!cat) {
      cat = { name: r.categoryName, responses: [] };
      byCategory.push(cat);
    }
    cat.responses.push(r);
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Inspections', href: '/inspections' }, { label: inspection.reference }]}
        title={`${inspection.branch.name} — ${inspection.template.name}`}
        description={`${inspection.reference} · ${inspection.branch.code} · ${
          submitted ? `submitted ${fmtDate(inspection.submittedAt)}` : `scheduled ${fmtDate(inspection.scheduledFor)}`
        }`}
        actions={
          <>
            <InspectionStatusBadge status={inspection.status} />
            {canRun && (
              <Link href={`/inspections/${inspection.id}/run`} className="btn-primary">
                {inspection.status === 'ASSIGNED' ? 'Start inspection' : 'Continue inspection'}
              </Link>
            )}
            {submitted && (
              <Link
                href={`/api/v1/inspections/${inspection.id}/report.pdf`}
                prefetch={false}
                className="btn-secondary"
              >
                Download PDF
              </Link>
            )}
          </>
        }
      />

      {str(query, 'submitted') === '1' && (
        <div className="mb-5 rounded-lg border border-ok/25 bg-ok/10 px-4 py-3 text-sm text-ok">
          Inspection submitted. {inspection.findings.length} finding
          {inspection.findings.length === 1 ? '' : 's'} raised and assigned with deadlines.
        </div>
      )}

      {!submitted && (
        <div className="mb-5 rounded-lg border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">
          This inspection is not yet submitted — {answered} of {inspection.totalItems} items answered.
          No score is calculated and no findings are raised until it is submitted.
        </div>
      )}

      {submitted && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <div className="card card-pad col-span-2 lg:col-span-1">
              <div className="kicker">Compliance score</div>
              <div className="mt-1">
                <ScoreBadge score={inspection.score} bands={cfg} size="lg" />
              </div>
            </div>
            <Stat label="Compliant" value={inspection.compliantCount} tone="ok" />
            <Stat label="Partial" value={inspection.partialCount} tone="warn" />
            <Stat label="Non-compliant" value={inspection.nonCompliantCount} tone="bad" />
            <Stat label="N/A" value={inspection.naCount} hint="Excluded from scoring" />
            <Stat
              label="Findings raised"
              value={inspection.findings.length}
              hint={`${openFindings} open · ${closedFindings} closed`}
              tone={openFindings > 0 ? 'warn' : 'ok'}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" title="Category performance" description="Where this branch is weak">
              {categoryScores.length > 0 ? (
                <CategoryScoreChart
                  data={categoryScores.map((c) => ({ category: c.name, score: c.score }))}
                />
              ) : (
                <EmptyState title="No category scores recorded" />
              )}
            </Card>

            <Card title="Inspection detail">
              <dl className="divide-y divide-line">
                <Field label="Branch">
                  <Link href={`/branches/${inspection.branchId}`} className="text-accent hover:underline">
                    {inspection.branch.name}
                  </Link>
                  <span className="block text-2xs text-muted">{inspection.branch.address}</span>
                </Field>
                <Field label="Inspector">{inspection.inspector.name}</Field>
                <Field label="Assigned by">{inspection.assignedBy?.name ?? '—'}</Field>
                <Field label="Submitted">{fmtDateTime(inspection.submittedAt)}</Field>
                <Field label="Grade band">{band ? BAND_LABELS[band] : '—'}</Field>
                <Field label="Scoring">
                  <span className="tabular-nums">
                    {inspection.earnedPoints} / {inspection.applicablePoints} points
                  </span>
                  <span className="block text-2xs text-muted">
                    Earned ÷ applicable × 100. N/A items are excluded.
                  </span>
                </Field>
              </dl>
            </Card>
          </div>

          {inspection.summary && (
            <Card className="mt-4" title="Recommendation" description="Generated from the results of this inspection">
              <p className="text-sm leading-relaxed text-ink">{inspection.summary}</p>
            </Card>
          )}

          <Card
            className="mt-4"
            title="Category summary"
            description="Score and answer breakdown per category"
            bodyClassName=""
          >
            <TableWrap minWidth={640}>
              <thead>
                <tr>
                  <th className="th">Category</th>
                  <th className="th text-right">Score</th>
                  <th className="th text-right">Compliant</th>
                  <th className="th text-right">Partial</th>
                  <th className="th text-right">Non-compliant</th>
                  <th className="th text-right">N/A</th>
                </tr>
              </thead>
              <tbody>
                {categoryScores.map((c) => (
                  <tr key={c.name}>
                    <td className="td font-medium">{c.name}</td>
                    <td className="td text-right">
                      <ScoreBadge score={c.score} bands={cfg} />
                    </td>
                    <td className="td text-right tabular-nums text-ok">{c.compliant}</td>
                    <td className="td text-right tabular-nums text-warn">{c.partial}</td>
                    <td className="td text-right tabular-nums text-bad">{c.nonCompliant}</td>
                    <td className="td text-right tabular-nums text-muted">{c.na}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </Card>

          <Card
            className="mt-4"
            title="Findings raised"
            description="Corrective actions generated from this inspection"
            bodyClassName=""
          >
            {inspection.findings.length === 0 ? (
              <EmptyState
                title="No findings"
                description="No non-compliances were recorded during this inspection."
              />
            ) : (
              <>
                {overdueFindings > 0 && (
                  <p className="border-b border-line bg-bad/5 px-4 py-2 text-xs text-bad sm:px-5">
                    {overdueFindings} of these findings {overdueFindings === 1 ? 'is' : 'are'} past
                    the remediation deadline.
                  </p>
                )}
                <TableWrap minWidth={860}>
                  <thead>
                    <tr>
                      <th className="th">Finding</th>
                      <th className="th">Category / Item</th>
                      <th className="th">Severity</th>
                      <th className="th">Status</th>
                      <th className="th">Owner</th>
                      <th className="th">Due</th>
                      <th className="th">Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspection.findings.map((f) => (
                      <tr key={f.id} className="row-link">
                        <td className="td">
                          <Link
                            href={`/findings/${f.id}`}
                            className="font-mono text-xs text-accent hover:underline"
                          >
                            {f.number}
                          </Link>
                        </td>
                        <td className="td max-w-[20rem]">
                          <div className="text-2xs uppercase tracking-wide text-faint">
                            {f.categoryName}
                          </div>
                          <div className="truncate" title={f.itemText}>
                            {f.itemText}
                          </div>
                        </td>
                        <td className="td">
                          <SeverityBadge severity={f.severity} />
                        </td>
                        <td className="td">
                          <FindingStatusBadge status={f.status} />
                        </td>
                        <td className="td text-muted">{f.assignedTo?.name ?? 'Unassigned'}</td>
                        <td className="td whitespace-nowrap text-muted">{fmtDate(f.dueDate)}</td>
                        <td className="td">
                          <DeadlineBadge
                            state={deadlineState(f, cfg.dueSoonHours)}
                            detail={describeRemaining(f.dueDate, f.status)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              </>
            )}
          </Card>
        </>
      )}

      <Card
        className="mt-4"
        title="Checklist responses"
        description={`${answered} of ${inspection.totalItems} items answered`}
        bodyClassName=""
      >
        {byCategory.map((cat) => (
          <div key={cat.name}>
            <h3 className="border-b border-line bg-raised px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted sm:px-5">
              {cat.name}
            </h3>
            <ul className="divide-y divide-line">
              {cat.responses.map((r) => (
                <li key={r.id} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{r.itemText}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {r._count.evidence > 0 && (
                        <span className="text-2xs text-muted">{r._count.evidence} photo(s)</span>
                      )}
                      {r.result ? (
                        <ResultBadge result={r.result} />
                      ) : (
                        <span className="text-2xs text-faint">Not answered</span>
                      )}
                    </div>
                  </div>
                  {r.observation && (
                    <p className="mt-1.5 text-sm text-muted">{r.observation}</p>
                  )}
                  {r.comment && (
                    <p className="mt-1 text-xs italic text-faint">Inspector note: {r.comment}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Card>
    </>
  );
}
