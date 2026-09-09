'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleSlash,
  CloudOff,
  Loader2,
  Save,
  TriangleAlert,
  X,
} from 'lucide-react';

import {
  cacheInspection,
  getCachedInspection,
  queueAnswer,
  queuePhoto,
  queuedPhotosFor,
  removeQueuedPhoto,
  type CachedInspection,
} from '@/lib/offline/db';
import { registerServiceWorker, syncPending } from '@/lib/offline/sync';

type Result = 'COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NON_COMPLIANT' | 'NOT_APPLICABLE';

type Item = CachedInspection['categories'][number]['items'][number];

const RESULT_OPTIONS: {
  value: Result;
  label: string;
  short: string;
  icon: typeof Check;
  classes: string;
}[] = [
  {
    value: 'COMPLIANT',
    label: 'Compliant',
    short: 'OK',
    icon: Check,
    classes: 'border-ok bg-ok text-white',
  },
  {
    value: 'PARTIALLY_COMPLIANT',
    label: 'Partially Compliant',
    short: 'Partial',
    icon: TriangleAlert,
    classes: 'border-warn bg-warn text-white',
  },
  {
    value: 'NON_COMPLIANT',
    label: 'Non-Compliant',
    short: 'Fail',
    icon: X,
    classes: 'border-bad bg-bad text-white',
  },
  {
    value: 'NOT_APPLICABLE',
    label: 'N/A',
    short: 'N/A',
    icon: CircleSlash,
    classes: 'border-faint bg-faint text-white',
  },
];

/**
 * The field inspection screen.
 *
 * Built for a phone in a branch with poor signal: one item at a time, large
 * touch targets, every answer written to IndexedDB first and synced afterwards.
 * Losing connectivity mid-inspection costs nothing.
 */
export function InspectionRunner({ initial }: { initial: CachedInspection }) {
  const router = useRouter();

  const [data, setData] = useState<CachedInspection>(initial);
  const [index, setIndex] = useState(0);
  const [online, setOnline] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [localPhotos, setLocalPhotos] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const coords = useRef<{ lat: number; lng: number } | null>(null);

  // Flatten to a single sequence — the runner is one question at a time.
  const items = useMemo(
    () =>
      data.categories.flatMap((c) =>
        c.items.map((i) => ({ ...i, categoryName: c.name })),
      ),
    [data],
  );

  const current = items[index];
  const answered = items.filter((i) => i.result).length;
  const progress = items.length > 0 ? Math.round((answered / items.length) * 100) : 0;

  const unansweredMandatory = items.filter((i) => i.isMandatory && !i.result);

  // --- lifecycle ----------------------------------------------------------

  useEffect(() => {
    registerServiceWorker();
    setOnline(navigator.onLine);

    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    // Cache immediately so a reload with no signal still opens the inspection.
    void cacheInspection(initial);

    // Best-effort location, attached to answers as the inspector works.
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        coords.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [initial]);

  // Prefer locally cached answers if the device has unsynced work.
  useEffect(() => {
    void (async () => {
      const cached = await getCachedInspection(initial.id).catch(() => null);
      if (cached && cached.downloadedAt >= initial.downloadedAt) setData(cached);
    })();
  }, [initial]);

  const refreshLocalPhotoCounts = useCallback(async (responseId: string) => {
    const queued = await queuedPhotosFor(responseId).catch(() => []);
    setLocalPhotos((prev) => ({ ...prev, [responseId]: queued.length }));
  }, []);

  useEffect(() => {
    if (current) void refreshLocalPhotoCounts(current.responseId);
  }, [current, refreshLocalPhotoCounts]);

  // --- persistence --------------------------------------------------------

  const persist = useCallback(
    async (next: CachedInspection, item: Item) => {
      setSaving(true);
      setError(null);
      await cacheInspection({ ...next, downloadedAt: Date.now() });
      await queueAnswer({
        inspectionId: next.id,
        responseId: item.responseId,
        result: item.result,
        observation: item.observation,
        comment: item.comment,
        severity: item.severity,
        latitude: coords.current?.lat ?? null,
        longitude: coords.current?.lng ?? null,
        answeredAt: new Date().toISOString(),
      });

      if (navigator.onLine) {
        const res = await syncPending().catch(() => null);
        if (res && res.failed > 0) {
          setError('Some changes could not be synced yet — they are saved on this device.');
        }
      }
      setSaving(false);
      setSavedAt(Date.now());
    },
    [],
  );

  const update = useCallback(
    (patch: Partial<Item>) => {
      if (!current) return;
      setData((prev) => {
        const next: CachedInspection = {
          ...prev,
          categories: prev.categories.map((c) => ({
            ...c,
            items: c.items.map((i) =>
              i.responseId === current.responseId ? { ...i, ...patch } : i,
            ),
          })),
        };
        const updated = next.categories
          .flatMap((c) => c.items)
          .find((i) => i.responseId === current.responseId)!;
        void persist(next, updated);
        return next;
      });
    },
    [current, persist],
  );

  async function flush() {
    setSyncMessage('Syncing…');
    const res = await syncPending().catch(() => null);
    if (!res) {
      setSyncMessage(null);
      return;
    }
    if (res.failed > 0) {
      setSyncMessage(`${res.failed} item(s) still pending — will retry`);
    } else if (res.answersSynced + res.photosSynced > 0) {
      setSyncMessage('Inspection successfully synced');
      if (current) void refreshLocalPhotoCounts(current.responseId);
    } else {
      setSyncMessage(null);
    }
    setTimeout(() => setSyncMessage(null), 4000);
  }

  // --- photos -------------------------------------------------------------

  async function addPhotos(list: FileList | null) {
    if (!list?.length || !current) return;
    setUploading(true);
    setError(null);

    for (const file of Array.from(list)) {
      if (navigator.onLine) {
        const form = new FormData();
        form.append('file', file);
        form.append('responseId', current.responseId);
        form.append('kind', 'INSPECTION');
        form.append('caption', `${current.text} — condition observed during inspection`);
        form.append('capturedAt', new Date().toISOString());
        if (coords.current) {
          form.append('latitude', String(coords.current.lat));
          form.append('longitude', String(coords.current.lng));
        }
        const res = await fetch('/api/v1/evidence', { method: 'POST', body: form });
        if (res.ok) {
          update({ evidenceCount: (current.evidenceCount ?? 0) + 1 });
          continue;
        }
        const body = await res.json().catch(() => ({}));
        // A 4xx is a real rejection; anything else is treated as a transport
        // problem and the photo is queued rather than lost.
        if (res.status >= 400 && res.status < 500) {
          setError(body.error ?? `Could not upload ${file.name}`);
          continue;
        }
      }

      await queuePhoto({
        inspectionId: data.id,
        responseId: current.responseId,
        blob: file,
        fileName: file.name || `photo-${Date.now()}.jpg`,
        mimeType: file.type || 'image/jpeg',
        caption: `${current.text} — condition observed during inspection`,
        latitude: coords.current?.lat ?? null,
        longitude: coords.current?.lng ?? null,
        capturedAt: new Date().toISOString(),
      });
      await refreshLocalPhotoCounts(current.responseId);
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  // --- submit -------------------------------------------------------------

  async function submit() {
    setSubmitting(true);
    setError(null);

    const sync = await syncPending().catch(() => null);
    if (sync && sync.failed > 0) {
      setError('Some answers have not reached the server yet. Reconnect and try again.');
      setSubmitting(false);
      return;
    }

    const res = await fetch(`/api/v1/inspections/${data.id}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'The inspection could not be submitted');
      setSubmitting(false);
      return;
    }

    router.push(`/inspections/${data.id}?submitted=1`);
    router.refresh();
  }

  if (!current) {
    return <p className="p-6 text-sm text-muted">This inspection has no checklist items.</p>;
  }

  const needsObservation = current.result === 'NON_COMPLIANT' && !current.observation?.trim();
  const photoCount = (current.evidenceCount ?? 0) + (localPhotos[current.responseId] ?? 0);
  const needsPhoto =
    current.result === 'NON_COMPLIANT' && current.requirePhotoOnFail && photoCount === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-2xl flex-col">
      {/* Header: identity + progress, always visible */}
      <div className="sticky top-14 z-20 -mx-3 border-b border-line bg-surface px-3 py-3 sm:-mx-5 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{data.branchName}</p>
            <p className="truncate text-2xs text-muted">
              {data.branchCode} · <span className="font-mono">{data.reference}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!online && (
              <span className="flex items-center gap-1 rounded border border-warn/25 bg-warn/10 px-1.5 py-1 text-2xs font-medium text-warn">
                <CloudOff className="h-3 w-3" aria-hidden />
                Offline
              </span>
            )}
            {saving && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Saving" />}
          </div>
        </div>

        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-2xs">
            <span className="font-medium text-muted">Inspection progress</span>
            <span className="tabular-nums text-ink">
              {answered} / {items.length} items · {progress}%
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-raised"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Inspection progress"
          >
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {(syncMessage || savedAt) && (
          <p className="mt-1.5 text-2xs text-muted">
            {syncMessage ??
              (online ? 'Saved' : 'Offline — data saved locally on this device')}
          </p>
        )}
      </div>

      {/* Current item */}
      <div className="flex-1 py-4">
        <p className="kicker">
          {current.categoryName} · Item {index + 1} of {items.length}
        </p>
        <h2 className="mt-1.5 text-lg font-semibold leading-snug text-ink">
          {current.text}
          {current.isMandatory && <span className="ml-1.5 text-bad">*</span>}
        </h2>
        {current.guidance && <p className="mt-1.5 text-sm text-muted">{current.guidance}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {RESULT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = current.result === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  update({
                    result: active ? null : opt.value,
                    severity:
                      opt.value === 'NON_COMPLIANT' && !current.severity
                        ? current.defaultSeverity
                        : current.severity,
                  })
                }
                aria-pressed={active}
                className={clsx(
                  'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-3 text-sm font-medium transition-colors',
                  active ? opt.classes : 'border-line bg-surface text-muted hover:border-faint hover:text-ink',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-center leading-tight">{opt.short}</span>
              </button>
            );
          })}
        </div>

        {/* Deficiency detail — only asked for when it is actually needed */}
        {(current.result === 'NON_COMPLIANT' || current.result === 'PARTIALLY_COMPLIANT') && (
          <div className="mt-4 space-y-3 rounded-lg border border-line bg-raised p-3">
            <div>
              <label className="label" htmlFor="observation">
                Observation {current.result === 'NON_COMPLIANT' && <span className="text-bad">*</span>}
              </label>
              <textarea
                id="observation"
                rows={3}
                className="input"
                placeholder="What exactly is wrong? Be specific enough that someone else can fix it."
                defaultValue={current.observation ?? ''}
                key={`obs-${current.responseId}`}
                onBlur={(e) => update({ observation: e.target.value || null })}
              />
              {needsObservation && (
                <p className="mt-1 text-2xs text-bad">
                  An observation is required before this inspection can be submitted.
                </p>
              )}
            </div>

            {current.result === 'NON_COMPLIANT' && (
              <div>
                <label className="label" htmlFor="severity">
                  Severity
                </label>
                <select
                  id="severity"
                  className="input"
                  value={current.severity ?? current.defaultSeverity}
                  onChange={(e) => update({ severity: e.target.value })}
                >
                  <option value="CRITICAL">Critical — immediate safety, security or business risk</option>
                  <option value="HIGH">High — significant compliance or operational issue</option>
                  <option value="MEDIUM">Medium — corrective action needed, not immediate</option>
                  <option value="LOW">Low — minor deficiency or housekeeping</option>
                </select>
                <p className="mt-1 text-2xs text-muted">
                  Severity sets the remediation deadline automatically.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Evidence */}
        <div className="mt-4">
          <input
            ref={fileRef}
            id="evidence-input"
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => addPhotos(e.target.files)}
          />
          <label
            htmlFor="evidence-input"
            className={clsx(
              'btn-secondary btn-lg w-full cursor-pointer',
              needsPhoto && 'border-bad text-bad',
            )}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Camera className="h-5 w-5" aria-hidden />
            )}
            {uploading ? 'Saving photo…' : 'Take or add photo'}
            {photoCount > 0 && (
              <span className="ml-1 rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-semibold text-accent">
                {photoCount}
              </span>
            )}
          </label>
          {needsPhoto && (
            <p className="mt-1 text-2xs text-bad">
              Photo evidence is required for a non-compliant answer on this item.
            </p>
          )}
          {(localPhotos[current.responseId] ?? 0) > 0 && (
            <p className="mt-1 text-2xs text-warn">
              {localPhotos[current.responseId]} photo(s) held on this device, waiting to sync.
            </p>
          )}
        </div>

        <div className="mt-4">
          <label className="label" htmlFor="comment">
            Inspector comment (optional)
          </label>
          <textarea
            id="comment"
            rows={2}
            className="input"
            placeholder="Anything the branch or reviewer should know."
            defaultValue={current.comment ?? ''}
            key={`cmt-${current.responseId}`}
            onBlur={(e) => update({ comment: e.target.value || null })}
          />
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
      </div>

      {/* Sticky action bar — thumb-reachable on a phone */}
      <div className="sticky bottom-0 -mx-3 border-t border-line bg-surface px-3 py-3 sm:-mx-5 sm:px-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="btn-secondary btn-lg flex-1"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Previous
          </button>

          <button type="button" onClick={flush} className="btn-secondary btn-lg" aria-label="Save and sync">
            <Save className="h-4 w-4" aria-hidden />
          </button>

          {index < items.length - 1 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
              className="btn-primary btn-lg flex-1"
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || unansweredMandatory.length > 0}
              onClick={submit}
              className="btn-primary btn-lg flex-1"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Submit
            </button>
          )}
        </div>

        {index === items.length - 1 && unansweredMandatory.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const first = items.findIndex((i) => i.responseId === unansweredMandatory[0].responseId);
              if (first >= 0) setIndex(first);
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-warn/25 bg-warn/10 px-3 py-2 text-2xs font-medium text-warn"
          >
            <CircleAlert className="h-3.5 w-3.5" aria-hidden />
            {unansweredMandatory.length} mandatory item(s) unanswered — go to the first
          </button>
        )}

        <div className="mt-2 flex items-center justify-between text-2xs text-muted">
          <Link href={`/inspections/${data.id}`} className="hover:text-accent hover:underline">
            Exit to summary
          </Link>
          <button type="button" onClick={() => setIndex(0)} className="hover:text-accent hover:underline">
            Back to first item
          </button>
        </div>
      </div>
    </div>
  );
}
