'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { X } from 'lucide-react';

export type FilterDef = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
};

/**
 * URL-driven filters: every selection is a query parameter, so a filtered view
 * is shareable, bookmarkable and survives a refresh.
 */
export function FilterBar({
  filters,
  showDateRange = true,
  extra,
}: {
  filters: FilterDef[];
  showDateRange?: boolean;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setParam = useCallback(
    (name: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(name, value);
      else next.delete(name);
      next.delete('page');
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const activeCount = [...params.keys()].filter((k) => k !== 'page' && params.get(k)).length;

  return (
    <div className="card mb-5 flex flex-wrap items-end gap-3 p-3 sm:p-4">
      {filters.map((f) => (
        <div key={f.name} className="min-w-[9rem] flex-1 sm:max-w-[13rem]">
          <label className="label" htmlFor={`filter-${f.name}`}>
            {f.label}
          </label>
          <select
            id={`filter-${f.name}`}
            className="input h-9 py-0"
            value={params.get(f.name) ?? ''}
            onChange={(e) => setParam(f.name, e.target.value)}
          >
            <option value="">All</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}

      {showDateRange && (
        <>
          <div className="min-w-[8.5rem] flex-1 sm:max-w-[11rem]">
            <label className="label" htmlFor="filter-from">
              From
            </label>
            <input
              id="filter-from"
              type="date"
              className="input h-9 py-0"
              value={params.get('from') ?? ''}
              onChange={(e) => setParam('from', e.target.value)}
            />
          </div>
          <div className="min-w-[8.5rem] flex-1 sm:max-w-[11rem]">
            <label className="label" htmlFor="filter-to">
              To
            </label>
            <input
              id="filter-to"
              type="date"
              className="input h-9 py-0"
              value={params.get('to') ?? ''}
              onChange={(e) => setParam('to', e.target.value)}
            />
          </div>
        </>
      )}

      {extra}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="btn-ghost h-9 whitespace-nowrap"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
          Clear ({activeCount})
        </button>
      )}
    </div>
  );
}
