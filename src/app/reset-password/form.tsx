'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PASSWORD_RULES } from '@/lib/auth/password';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const failing = PASSWORD_RULES.filter((r) => !r.test(password));
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);

        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, password }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? 'The password could not be reset');
          setBusy(false);
          return;
        }

        router.replace('/login?reset=1');
      }}
    >
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
        <ul className="mt-1.5 space-y-0.5">
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

      <div>
        <label className="label" htmlFor="confirm">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="input"
        />
        {mismatch && <p className="mt-1 text-2xs text-bad">The passwords do not match.</p>}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || failing.length > 0 || mismatch || confirm === ''}
        className="btn-primary w-full"
      >
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}
