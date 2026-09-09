'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { PASSWORD_RULES } from '@/lib/auth/password';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/permissions';

const ROLES = ['SUPER_ADMIN', 'REGIONAL_MANAGER', 'INSPECTOR', 'BRANCH_MANAGER', 'VERIFIER'] as const;

export function UserForm({
  branches,
  regions,
}: {
  branches: { id: string; name: string; code: string }[];
  regions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [role, setRole] = useState<(typeof ROLES)[number]>('INSPECTOR');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const scopeByRegion = role === 'REGIONAL_MANAGER';
  const scopeByBranch = role === 'INSPECTOR' || role === 'BRANCH_MANAGER';
  const failing = PASSWORD_RULES.filter((r) => !r.test(password));

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setDone(null);
        const f = new FormData(e.currentTarget);
        const form = e.currentTarget;

        const res = await fetch('/api/v1/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: f.get('name'),
            email: f.get('email'),
            password: f.get('password'),
            role: f.get('role'),
            jobTitle: f.get('jobTitle') || undefined,
            phone: f.get('phone') || undefined,
            regionIds: f.getAll('regionIds').map(String),
            branchIds: f.getAll('branchIds').map(String),
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? 'The user could not be created');
        } else {
          const body = await res.json();
          setDone(`${body.data.name} created.`);
          form.reset();
          setPassword('');
          router.refresh();
        }
        setBusy(false);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="u-name">
            Full name
          </label>
          <input id="u-name" name="name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="u-email">
            Email
          </label>
          <input id="u-email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="u-role">
            Role
          </label>
          <select
            id="u-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="input"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-2xs text-muted">{ROLE_DESCRIPTIONS[role]}</p>
        </div>
        <div>
          <label className="label" htmlFor="u-jobTitle">
            Job title (optional)
          </label>
          <input id="u-jobTitle" name="jobTitle" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="u-phone">
            Phone (optional)
          </label>
          <input id="u-phone" name="phone" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="u-password">
            Initial password
          </label>
          <input
            id="u-password"
            name="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {PASSWORD_RULES.map((r) => {
              const passes = r.test(password);
              return (
                <li
                  key={r.label}
                  className={`text-2xs ${password === '' ? 'text-faint' : passes ? 'text-ok' : 'text-bad'}`}
                >
                  {passes && password !== '' ? '✓' : '•'} {r.label}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {scopeByRegion && (
        <fieldset>
          <legend className="label">Regions this manager oversees</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {regions.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="regionIds" value={r.id} className="h-4 w-4" />
                {r.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {scopeByBranch && (
        <fieldset>
          <legend className="label">
            Branches this user can access{' '}
            <span className="font-normal text-faint">
              — a user with no branches assigned will see nothing
            </span>
          </legend>
          <div className="max-h-44 overflow-y-auto rounded-md border border-line p-2.5">
            <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="branchIds" value={b.id} className="h-4 w-4" />
                  <span className="truncate">
                    {b.name} <span className="text-2xs text-muted">({b.code})</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {done && (
        <p className="rounded-md border border-ok/25 bg-ok/10 px-3 py-2 text-sm text-ok">{done}</p>
      )}

      <button
        type="submit"
        disabled={busy || failing.length > 0}
        className="btn-primary"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Create user
      </button>
    </form>
  );
}
