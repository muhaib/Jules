'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check } from 'lucide-react';

export function MarkRead({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      aria-label="Mark as read"
      title="Mark as read"
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/v1/notifications/${id}/read`, { method: 'POST' });
        router.refresh();
        setBusy(false);
      }}
      className="btn-ghost shrink-0 p-1.5"
    >
      <Check className="h-4 w-4" />
    </button>
  );
}

export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/v1/notifications/read-all', { method: 'POST' });
        router.refresh();
        setBusy(false);
      }}
      className="btn-secondary"
    >
      {busy ? 'Marking…' : 'Mark all read'}
    </button>
  );
}
