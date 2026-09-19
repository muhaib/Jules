'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyButton } from './Chrome';

export function RotateKeyButton({ siteId }) {
  const router = useRouter();
  const [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(false);

  if (fresh) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <code className="small">{fresh}</code>
        <CopyButton text={fresh} label="Copy new key" />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="ghost"
      disabled={busy}
      onClick={async () => {
        if (!confirm('Rotate this key? The current key stops working immediately and any deployment still using it will stop reporting.')) return;
        setBusy(true);
        const response = await fetch(`/api/sites/${siteId}/key`, { method: 'POST' });
        if (response.ok) {
          setFresh((await response.json()).siteKey);
          router.refresh();
        }
        setBusy(false);
      }}
    >
      {busy ? 'Rotating…' : 'Rotate key'}
    </button>
  );
}
