'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

import { fmtDateTime } from '@/lib/format';

export type EvidenceItem = {
  id: string;
  kind: string;
  caption: string | null;
  mimeType: string;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  uploadedBy: string;
};

/**
 * Before / after evidence, side by side. The pairing is the whole point: a
 * reviewer should be able to see the defect and the correction together without
 * hunting through a single undifferentiated pile of photos.
 */
export function EvidenceGallery({ items }: { items: EvidenceItem[] }) {
  const [active, setActive] = useState<EvidenceItem | null>(null);

  const before = items.filter((i) => i.kind === 'BEFORE' || i.kind === 'INSPECTION');
  const after = items.filter((i) => i.kind === 'AFTER' || i.kind === 'VERIFICATION');

  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-faint">No evidence attached.</p>;
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <Column title="Before" subtitle="Condition recorded during inspection" items={before} onOpen={setActive} />
        <Column title="After" subtitle="Corrective action evidence" items={after} onOpen={setActive} />
      </div>

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Evidence preview"
          onClick={() => setActive(null)}
        >
          <div
            className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-surface"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {active.kind === 'AFTER' || active.kind === 'VERIFICATION' ? 'After' : 'Before'}
                  {active.caption ? ` — ${active.caption}` : ''}
                </p>
                <p className="mt-0.5 text-2xs text-muted">
                  {fmtDateTime(active.capturedAt)} · uploaded by {active.uploadedBy}
                  {active.latitude !== null && active.longitude !== null
                    ? ` · ${active.latitude.toFixed(4)}, ${active.longitude.toFixed(4)}`
                    : ''}
                </p>
              </div>
              <button type="button" onClick={() => setActive(null)} className="btn-ghost p-1.5" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto bg-raised p-3">
              {active.mimeType.startsWith('video/') ? (
                <video src={`/api/v1/evidence/${active.id}`} controls className="mx-auto max-h-[70vh]" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={`/api/v1/evidence/${active.id}`}
                  alt={active.caption ?? 'Evidence'}
                  className="mx-auto max-h-[70vh] w-auto"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Column({
  title,
  subtitle,
  items,
  onOpen,
}: {
  title: string;
  subtitle: string;
  items: EvidenceItem[];
  onOpen: (item: EvidenceItem) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="kicker">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-line text-xs text-faint">
          None yet
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="group block w-full overflow-hidden rounded-md border border-line text-left transition-colors hover:border-accent"
              >
                <div className="aspect-[4/3] bg-raised">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/v1/evidence/${item.id}`}
                    alt={item.caption ?? `${title} evidence`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                {item.caption && (
                  <p className="line-clamp-2 px-2 py-1.5 text-2xs text-muted group-hover:text-ink">
                    {item.caption}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
