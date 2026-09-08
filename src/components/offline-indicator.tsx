'use client';

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';

import { pendingSyncCount, syncPending } from '@/lib/offline/sync';

/**
 * Header status for field use: shows when the device is offline and how much
 * work is queued locally, and lets the inspector force a sync attempt.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);

    const refresh = async () => {
      try {
        setPending(await pendingSyncCount());
      } catch {
        setPending(0);
      }
    };

    const goOnline = () => {
      setOnline(true);
      void runSync();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    void refresh();
    const timer = setInterval(refresh, 8000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      clearInterval(timer);
    };
  }, []);

  async function runSync() {
    setSyncing(true);
    try {
      await syncPending();
      setPending(await pendingSyncCount());
    } catch {
      // Leave the queue intact; it will be retried.
    } finally {
      setSyncing(false);
    }
  }

  if (online && pending === 0) return null;

  if (!online) {
    return (
      <span className="flex items-center gap-1.5 rounded border border-warn/25 bg-warn/10 px-2 py-1 text-2xs font-medium text-warn">
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Offline — data saved locally</span>
        <span className="sm:hidden">Offline</span>
        {pending > 0 && <span className="tabular-nums">({pending})</span>}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={runSync}
      disabled={syncing}
      className="flex items-center gap-1.5 rounded border border-accent/25 bg-accent-soft px-2 py-1 text-2xs font-medium text-accent disabled:opacity-60"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
      {syncing ? 'Syncing…' : `Sync ${pending} change${pending === 1 ? '' : 's'}`}
    </button>
  );
}
