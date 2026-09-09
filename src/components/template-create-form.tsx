'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export function TemplateCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const f = new FormData(e.currentTarget);

        const res = await fetch('/api/v1/templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: f.get('name'),
            description: f.get('description') || undefined,
            branchType: f.get('branchType') || undefined,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? 'The template could not be created');
          setBusy(false);
          return;
        }

        const body = await res.json();
        router.push(`/templates/${body.data.id}`);
        router.refresh();
      }}
    >
      <div>
        <label className="label" htmlFor="t-name">
          Template name
        </label>
        <input
          id="t-name"
          name="name"
          required
          className="input"
          placeholder="Bank Branch Facility Inspection"
        />
      </div>
      <div>
        <label className="label" htmlFor="t-description">
          Description (optional)
        </label>
        <textarea id="t-description" name="description" rows={2} className="input" />
      </div>
      <div>
        <label className="label" htmlFor="t-branchType">
          Applies to branch type (optional)
        </label>
        <input id="t-branchType" name="branchType" className="input" placeholder="Leave blank for all types" />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Create template
      </button>
    </form>
  );
}
