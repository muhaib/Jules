'use client';

import { db } from '@/lib/offline/db';

export type SyncResult = {
  answersSynced: number;
  photosSynced: number;
  failed: number;
};

export async function pendingSyncCount(): Promise<number> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return 0;
  const d = await db();
  const [answers, photos] = await Promise.all([d.count('answers'), d.count('photos')]);
  return answers + photos;
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * Replays queued work to the server. Answers go first so a photo always lands
 * against a response the server already knows about. Anything that fails stays
 * in the queue for the next attempt — nothing is dropped silently.
 */
export function syncPending(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(): Promise<SyncResult> {
  const result: SyncResult = { answersSynced: 0, photosSynced: 0, failed: 0 };
  if (typeof window === 'undefined' || !navigator.onLine) return result;

  const d = await db();

  // --- answers, batched per inspection ------------------------------------
  const answers = await d.getAll('answers');
  const byInspection = new Map<string, typeof answers>();
  for (const a of answers) {
    const list = byInspection.get(a.inspectionId) ?? [];
    list.push(a);
    byInspection.set(a.inspectionId, list);
  }

  for (const [inspectionId, batch] of byInspection) {
    try {
      const res = await fetch(`/api/v1/inspections/${inspectionId}/responses`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          responses: batch.map((a) => ({
            responseId: a.responseId,
            result: a.result,
            observation: a.observation,
            comment: a.comment,
            severity: a.severity,
            latitude: a.latitude,
            longitude: a.longitude,
            answeredAt: a.answeredAt,
          })),
        }),
      });

      if (!res.ok) {
        // 4xx means the server rejected this payload; retrying will not help, so
        // drop it rather than blocking the queue forever. 5xx is retried.
        if (res.status >= 400 && res.status < 500) {
          for (const a of batch) await d.delete('answers', a.key);
        }
        result.failed += batch.length;
        continue;
      }

      for (const a of batch) await d.delete('answers', a.key);
      result.answersSynced += batch.length;
    } catch {
      result.failed += batch.length;
    }
  }

  // --- photos, one multipart request each ---------------------------------
  const photos = await d.getAll('photos');
  for (const p of photos) {
    try {
      const form = new FormData();
      form.append('file', p.blob, p.fileName);
      form.append('responseId', p.responseId);
      form.append('kind', 'INSPECTION');
      if (p.caption) form.append('caption', p.caption);
      if (p.latitude !== null) form.append('latitude', String(p.latitude));
      if (p.longitude !== null) form.append('longitude', String(p.longitude));
      form.append('capturedAt', p.capturedAt);

      const res = await fetch('/api/v1/evidence', { method: 'POST', body: form });
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500) await d.delete('photos', p.key);
        result.failed += 1;
        continue;
      }
      await d.delete('photos', p.key);
      result.photosSynced += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}

/** Registers the service worker that keeps the inspection UI available offline. */
export function registerServiceWorker() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // A failed registration only costs offline caching; the app still works.
  });
}
