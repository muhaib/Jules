'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CopyButton } from './Chrome';

export function NewSiteForm() {
  const [created, setCreated] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (created) {
    return (
      <div>
        <div className="notice warn" style={{ marginBottom: 16 }}>
          This key is shown once. It is stored only as a hash, so it cannot be
          recovered &mdash; if you lose it, rotate the key and redeploy.
        </div>
        <pre className="code" style={{ marginBottom: 12 }}>{created.siteKey}</pre>
        <div style={{ display: 'flex', gap: 8 }}>
          <CopyButton text={created.siteKey} label="Copy key" />
          <Link className="btn" href={`/sites/${created.site.id}/install`}>Install instructions</Link>
        </div>
      </div>
    );
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (response.ok) {
      setCreated(await response.json());
      return;
    }
    setError((await response.json().catch(() => ({}))).error ?? 'Could not create the site.');
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="field">
        Name
        <input name="name" required placeholder="Example Press" />
      </label>
      <label className="field">
        Domain
        <input name="domain" placeholder="example.com" />
        <span className="muted small">Used for the licensing links in your robots.txt.</span>
      </label>
      {error && <p className="notice error" style={{ marginBottom: 14 }}>{error}</p>}
      <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create site'}</button>
    </form>
  );
}
