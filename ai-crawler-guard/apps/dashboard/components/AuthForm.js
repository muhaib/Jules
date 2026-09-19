'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const MESSAGES = {
  invalid_credentials: 'That email and password do not match an account.',
  email_already_registered: 'There is already an account with that email.',
  registration_closed: 'Sign-ups are closed on this instance.',
  invalid_field: 'Check the highlighted field.',
};

export function AuthForm({ mode }) {
  const router = useRouter();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/auth/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form)),
    });
    if (response.ok) {
      router.push('/');
      router.refresh();
      return;
    }
    const body = await response.json().catch(() => ({}));
    const detail = body.details?.field ? ` (${body.details.field}: ${body.details.reason})` : '';
    setError((MESSAGES[body.error] ?? 'Something went wrong.') + detail);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit}>
      {mode === 'register' && (
        <label className="field">
          Name
          <input name="name" autoComplete="name" />
        </label>
      )}
      <label className="field">
        Email
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label className="field">
        Password
        <input
          name="password" type="password" required minLength={mode === 'register' ? 10 : 1}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        />
      </label>
      {error && <p className="notice error" style={{ marginBottom: 14 }}>{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? 'Working…' : mode === 'register' ? 'Create account' : 'Sign in'}
      </button>
      <p className="small muted" style={{ marginTop: 16 }}>
        {mode === 'register'
          ? <>Already have an account? <Link href="/login">Sign in</Link>.</>
          : <>No account yet? <Link href="/register">Create one</Link>.</>}
      </p>
    </form>
  );
}
