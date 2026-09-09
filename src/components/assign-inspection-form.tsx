'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function AssignInspectionForm({
  branches,
  templates,
  inspectors,
  defaultBranchId,
}: {
  branches: { id: string; name: string; code: string; branchType: string }[];
  templates: { id: string; name: string; branchType: string | null }[];
  inspectors: { id: string; name: string; jobTitle: string | null }[];
  defaultBranchId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  if (branches.length === 0 || templates.length === 0 || inspectors.length === 0) {
    return (
      <p className="text-sm text-muted">
        An inspection needs at least one active branch, one active template and one inspector.
        {branches.length === 0 && ' No branches are available in your scope.'}
        {templates.length === 0 && ' No active templates exist.'}
        {inspectors.length === 0 && ' No inspectors have been created.'}
      </p>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const f = new FormData(e.currentTarget);

        const res = await fetch('/api/v1/inspections', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            branchId: f.get('branchId'),
            templateId: f.get('templateId'),
            inspectorId: f.get('inspectorId'),
            scheduledFor: f.get('scheduledFor'),
            notes: f.get('notes') || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? 'The inspection could not be assigned');
          setBusy(false);
          return;
        }

        const body = await res.json();
        router.push(`/inspections/${body.data.id}`);
        router.refresh();
      }}
    >
      <div>
        <label className="label" htmlFor="branchId">
          Branch
        </label>
        <select id="branchId" name="branchId" required defaultValue={defaultBranchId ?? ''} className="input">
          <option value="" disabled>
            Select a branch
          </option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.code}) — {b.branchType}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="templateId">
          Template
        </label>
        <select id="templateId" name="templateId" required className="input">
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
              {t.branchType ? ` — for ${t.branchType}` : ''}
            </option>
          ))}
        </select>
        <p className="mt-1 text-2xs text-muted">
          The template is snapshotted onto the inspection, so later edits will not change it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="inspectorId">
            Inspector
          </label>
          <select id="inspectorId" name="inspectorId" required className="input">
            {inspectors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.jobTitle ? ` — ${i.jobTitle}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="scheduledFor">
            Scheduled for
          </label>
          <input
            id="scheduledFor"
            name="scheduledFor"
            type="date"
            required
            defaultValue={tomorrow}
            className="input"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="notes">
          Notes for the inspector (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          className="input"
          placeholder="Anything specific to check on this visit."
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Assign inspection
      </button>
    </form>
  );
}
