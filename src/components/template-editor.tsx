'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';

import { SeverityBadge } from '@/components/ui/badges';
import { Card } from '@/components/ui/shell';

type Item = {
  id: string;
  text: string;
  guidance: string | null;
  position: number;
  weight: number;
  isMandatory: boolean;
  defaultSeverity: string;
  requirePhotoOnFail: boolean;
};

type Category = {
  id: string;
  name: string;
  position: number;
  weight: number;
  items: Item[];
};

/**
 * Template editing: add, edit, reorder and remove categories and checklist items.
 *
 * Changes are saved through the API immediately rather than held in a giant
 * client-side draft — an admin editing one item should not risk losing the rest.
 */
export function TemplateEditor({
  templateId,
  categories: initial,
}: {
  templateId: string;
  categories: Category[];
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);

  async function call(path: string, method: string, body?: unknown, key = 'x') {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/v1/templates/${templateId}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? 'The change could not be saved');
        return null;
      }
      const data = await res.json();
      setCategories(data.data.categories);
      router.refresh();
      return data;
    } catch {
      setError('Network error — the change was not saved');
      return null;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md border border-bad/25 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {categories.map((cat, ci) => (
        <Card
          key={cat.id}
          title={cat.name}
          description={`${cat.items.length} items · category weight ×${cat.weight}`}
          bodyClassName=""
          actions={
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={ci === 0 || busy !== null}
                onClick={() => call(`/categories/${cat.id}/move`, 'POST', { direction: 'up' }, cat.id)}
                className="btn-ghost p-1.5"
                aria-label={`Move ${cat.name} up`}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={ci === categories.length - 1 || busy !== null}
                onClick={() => call(`/categories/${cat.id}/move`, 'POST', { direction: 'down' }, cat.id)}
                className="btn-ghost p-1.5"
                aria-label={`Move ${cat.name} down`}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (confirm(`Remove the "${cat.name}" category and all of its items from this template?`)) {
                    void call(`/categories/${cat.id}`, 'DELETE', undefined, cat.id);
                  }
                }}
                className="btn-ghost p-1.5 text-bad hover:bg-bad/10"
                aria-label={`Delete ${cat.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          }
        >
          <ul className="divide-y divide-line">
            {cat.items.map((item, ii) => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{item.text}</p>
                  {item.guidance && <p className="mt-0.5 text-2xs text-muted">{item.guidance}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={item.defaultSeverity as never} />
                    <span className="text-2xs text-muted">weight ×{item.weight}</span>
                    {item.isMandatory && <span className="text-2xs text-muted">mandatory</span>}
                    {item.requirePhotoOnFail && (
                      <span className="text-2xs text-muted">photo required on fail</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={ii === 0 || busy !== null}
                    onClick={() => call(`/items/${item.id}/move`, 'POST', { direction: 'up' }, item.id)}
                    className="btn-ghost p-1"
                    aria-label="Move item up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={ii === cat.items.length - 1 || busy !== null}
                    onClick={() => call(`/items/${item.id}/move`, 'POST', { direction: 'down' }, item.id)}
                    className="btn-ghost p-1"
                    aria-label="Move item down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      if (confirm(`Remove "${item.text}" from this template?`)) {
                        void call(`/items/${item.id}`, 'DELETE', undefined, item.id);
                      }
                    }}
                    className="btn-ghost p-1 text-bad hover:bg-bad/10"
                    aria-label="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="border-t border-line px-4 py-3 sm:px-5">
            {addingTo === cat.id ? (
              <ItemForm
                busy={busy !== null}
                onCancel={() => setAddingTo(null)}
                onSubmit={async (body) => {
                  const done = await call(`/categories/${cat.id}/items`, 'POST', body, cat.id);
                  if (done) setAddingTo(null);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingTo(cat.id)}
                className="btn-secondary w-full"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add checklist item
              </button>
            )}
          </div>
        </Card>
      ))}

      <Card>
        {addingCategory ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const done = await call(
                '/categories',
                'POST',
                { name: f.get('name'), weight: Number(f.get('weight')) || 1 },
                'new-category',
              );
              if (done) setAddingCategory(false);
            }}
          >
            <p className="section-title">New category</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
              <div>
                <label className="label" htmlFor="cat-name">
                  Category name
                </label>
                <input id="cat-name" name="name" required className="input" placeholder="e.g. Plumbing" />
              </div>
              <div>
                <label className="label" htmlFor="cat-weight">
                  Weight
                </label>
                <input
                  id="cat-weight"
                  name="weight"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={1}
                  className="input"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={busy !== null} className="btn-primary">
                {busy === 'new-category' && <Loader2 className="h-4 w-4 animate-spin" />}
                Add category
              </button>
              <button type="button" onClick={() => setAddingCategory(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAddingCategory(true)} className="btn-secondary w-full">
            <Plus className="h-4 w-4" aria-hidden />
            Add category
          </button>
        )}
      </Card>
    </div>
  );
}

function ItemForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (body: unknown) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await onSubmit({
          text: f.get('text'),
          guidance: f.get('guidance') || null,
          weight: Number(f.get('weight')) || 1,
          defaultSeverity: f.get('defaultSeverity'),
          isMandatory: f.get('isMandatory') === 'on',
          requirePhotoOnFail: f.get('requirePhotoOnFail') === 'on',
        });
      }}
    >
      <div>
        <label className="label" htmlFor="item-text">
          Checklist item
        </label>
        <input id="item-text" name="text" required className="input" placeholder="e.g. Fire extinguisher expiry" />
      </div>
      <div>
        <label className="label" htmlFor="item-guidance">
          Guidance for the inspector (optional)
        </label>
        <input
          id="item-guidance"
          name="guidance"
          className="input"
          placeholder={'What "compliant" actually looks like'}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="item-severity">
            Default severity when failed
          </label>
          <select id="item-severity" name="defaultSeverity" defaultValue="MEDIUM" className="input">
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="item-weight">
            Weight
          </label>
          <input id="item-weight" name="weight" type="number" min={1} max={10} defaultValue={1} className="input" />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="isMandatory" defaultChecked className="h-4 w-4" />
          Mandatory
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="requirePhotoOnFail" defaultChecked className="h-4 w-4" />
          Require photo when non-compliant
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Add item
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
