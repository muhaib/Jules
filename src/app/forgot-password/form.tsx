'use client';

import { useState } from 'react';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <div className="mt-6 space-y-3">
        <p className="rounded-md border border-ok/25 bg-ok/10 px-3 py-2 text-sm text-ok">{sent}</p>
        {devLink && (
          <div className="rounded-md border border-line bg-raised px-3 py-2.5">
            <p className="text-2xs font-semibold uppercase tracking-wider text-faint">
              Development only
            </p>
            <p className="mt-1 text-xs text-muted">
              No mail transport is configured in this environment, so the link is shown here instead
              of being emailed.
            </p>
            <a href={devLink} className="mt-2 block break-all font-mono text-2xs text-accent hover:underline">
              {devLink}
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const f = new FormData(e.currentTarget);
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: f.get('email') }),
        });
        const body = await res.json().catch(() => ({}));
        setSent(body.message ?? 'If that email is registered, a reset link has been sent.');
        setDevLink(body.devResetLink ?? null);
        setBusy(false);
      }}
    >
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required autoComplete="username" className="input" />
      </div>
      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
