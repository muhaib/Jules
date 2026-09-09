'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import type { OrgConfig } from '@/lib/domain/settings';
import { SEVERITY_DESCRIPTIONS, SEVERITY_LABELS } from '@/lib/domain/scoring';
import { Card } from '@/components/ui/shell';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

/** Human-readable rendering of an hour count, since deadlines are set in hours. */
function describeHours(hours: number) {
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = hours / 24;
  return Number.isInteger(days) ? `${days} day${days === 1 ? '' : 's'}` : `${days.toFixed(1)} days`;
}

export function SettingsForm({ config }: { config: OrgConfig }) {
  const router = useRouter();
  const [cfg, setCfg] = useState(config);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof OrgConfig>(key: K, value: OrgConfig[K]) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const setSeverity = (severity: (typeof SEVERITIES)[number], field: 'dueHours' | 'escalateEveryHours', value: number) => {
    setCfg((prev) => ({
      ...prev,
      severity: { ...prev.severity, [severity]: { ...prev.severity[severity], [field]: value } },
    }));
    setSaved(false);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch('/api/v1/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scoreCompliant: cfg.scoreCompliant,
        scorePartial: cfg.scorePartial,
        scoreNonCompliant: cfg.scoreNonCompliant,
        bandExcellent: cfg.bandExcellent,
        bandGood: cfg.bandGood,
        bandNeedsWork: cfg.bandNeedsWork,
        dueSoonHours: cfg.dueSoonHours,
        recurrenceThreshold: cfg.recurrenceThreshold,
        recurrenceWindowDays: cfg.recurrenceWindowDays,
        requirePhotoOnNonCompliance: cfg.requirePhotoOnNonCompliance,
        escalateToBranchManager: cfg.escalateToBranchManager,
        escalateToRegionalManager: cfg.escalateToRegionalManager,
        escalateToHeadOffice: cfg.escalateToHeadOffice,
        severity: Object.fromEntries(
          SEVERITIES.map((s) => [
            s,
            { dueHours: cfg.severity[s].dueHours, escalateEveryHours: cfg.severity[s].escalateEveryHours },
          ]),
        ),
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Settings could not be saved');
    } else {
      setSaved(true);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card title="Scoring" description="How each answer contributes to the compliance score">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ['scoreCompliant', 'Compliant earns'],
              ['scorePartial', 'Partially compliant earns'],
              ['scoreNonCompliant', 'Non-compliant earns'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label" htmlFor={key}>
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={key}
                  type="number"
                  min={0}
                  max={100}
                  value={cfg[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                  className="input"
                />
                <span className="text-sm text-muted">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md border border-line bg-raised px-3 py-2 text-xs text-muted">
          Compliance Score = Earned Points ÷ Applicable Points × 100. Items answered{' '}
          <strong className="text-ink">N/A</strong> are excluded from both sides of the calculation,
          so a branch is never penalised for equipment it does not have.
        </p>
      </Card>

      <Card title="Grade bands" description="The label shown against a score">
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ['bandExcellent', 'Excellent from'],
              ['bandGood', 'Good from'],
              ['bandNeedsWork', 'Needs Improvement from'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label" htmlFor={key}>
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={key}
                  type="number"
                  min={1}
                  max={100}
                  value={cfg[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                  className="input"
                />
                <span className="text-sm text-muted">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Anything below {cfg.bandNeedsWork}% is graded <strong className="text-bad">Poor</strong>.
        </p>
      </Card>

      <Card title="Remediation deadlines" description="How long a branch has to fix a finding, by severity">
        <div className="space-y-3">
          {SEVERITIES.map((s) => (
            <div key={s} className="grid items-end gap-3 border-b border-line pb-3 last:border-0 last:pb-0 sm:grid-cols-[1fr_9rem_9rem]">
              <div>
                <p className="text-sm font-medium text-ink">{SEVERITY_LABELS[s]}</p>
                <p className="text-2xs text-muted">{SEVERITY_DESCRIPTIONS[s]}</p>
              </div>
              <div>
                <label className="label" htmlFor={`due-${s}`}>
                  Due within (hours)
                </label>
                <input
                  id={`due-${s}`}
                  type="number"
                  min={1}
                  value={cfg.severity[s].dueHours}
                  onChange={(e) => setSeverity(s, 'dueHours', Number(e.target.value))}
                  className="input"
                />
                <p className="mt-1 text-2xs text-faint">{describeHours(cfg.severity[s].dueHours)}</p>
              </div>
              <div>
                <label className="label" htmlFor={`esc-${s}`}>
                  Escalate every (hours)
                </label>
                <input
                  id={`esc-${s}`}
                  type="number"
                  min={1}
                  value={cfg.severity[s].escalateEveryHours}
                  onChange={(e) => setSeverity(s, 'escalateEveryHours', Number(e.target.value))}
                  className="input"
                />
                <p className="mt-1 text-2xs text-faint">once overdue</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Escalation ladder" description="Who is alerted as a finding stays overdue">
        <ol className="space-y-2">
          <li className="flex items-center gap-2.5 text-sm text-ink">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-raised text-[10px] font-bold text-muted">
              1
            </span>
            Responsible person <span className="text-2xs text-faint">(always alerted)</span>
          </li>
          {(
            [
              ['escalateToBranchManager', 'Branch Manager'],
              ['escalateToRegionalManager', 'Regional Manager'],
              ['escalateToHeadOffice', 'Head Office'],
            ] as const
          ).map(([key, label], i) => (
            <li key={key}>
              <label className="flex items-center gap-2.5 text-sm text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-raised text-[10px] font-bold text-muted">
                  {i + 2}
                </span>
                <input
                  type="checkbox"
                  checked={cfg[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="h-4 w-4"
                />
                {label}
              </label>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Detection rules">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="dueSoonHours">
              &ldquo;Due soon&rdquo; window (hours)
            </label>
            <input
              id="dueSoonHours"
              type="number"
              min={1}
              value={cfg.dueSoonHours}
              onChange={(e) => set('dueSoonHours', Number(e.target.value))}
              className="input"
            />
            <p className="mt-1 text-2xs text-faint">{describeHours(cfg.dueSoonHours)} before the deadline</p>
          </div>
          <div>
            <label className="label" htmlFor="recurrenceThreshold">
              Flag as recurring after
            </label>
            <input
              id="recurrenceThreshold"
              type="number"
              min={2}
              max={20}
              value={cfg.recurrenceThreshold}
              onChange={(e) => set('recurrenceThreshold', Number(e.target.value))}
              className="input"
            />
            <p className="mt-1 text-2xs text-faint">occurrences of the same item at one branch</p>
          </div>
          <div>
            <label className="label" htmlFor="recurrenceWindowDays">
              Recurrence lookback (days)
            </label>
            <input
              id="recurrenceWindowDays"
              type="number"
              min={30}
              max={1825}
              value={cfg.recurrenceWindowDays}
              onChange={(e) => set('recurrenceWindowDays', Number(e.target.value))}
              className="input"
            />
          </div>
        </div>
        <label className="mt-4 flex items-start gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={cfg.requirePhotoOnNonCompliance}
            onChange={(e) => set('requirePhotoOnNonCompliance', e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            Require photo evidence for non-compliant answers
            <span className="block text-2xs text-muted">
              An inspection cannot be submitted while a non-compliant item that requires a photo has none.
            </span>
          </span>
        </label>
      </Card>

      {error && (
        <p role="alert" className="rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-md border border-ok/25 bg-ok/10 px-3 py-2 text-sm text-ok">
          Settings saved. New findings will use these rules; existing deadlines are unchanged.
        </p>
      )}

      <div className="sticky bottom-0 -mx-1 bg-canvas/95 px-1 py-3 backdrop-blur">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save settings
        </button>
      </div>
    </form>
  );
}
