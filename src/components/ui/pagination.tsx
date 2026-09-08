import Link from 'next/link';

import { qs } from '@/lib/format';

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="text-xs text-muted">
        Showing <span className="font-medium text-ink">{from.toLocaleString('en-GB')}</span>–
        <span className="font-medium text-ink">{to.toLocaleString('en-GB')}</span> of{' '}
        <span className="font-medium text-ink">{total.toLocaleString('en-GB')}</span>
      </p>
      <div className="flex items-center gap-2">
        <PageLink
          disabled={page <= 1}
          href={`${basePath}${qs({ ...params, page: page - 1 })}`}
          label="Previous"
        />
        <span className="text-xs tabular-nums text-muted">
          Page {page} of {pages}
        </span>
        <PageLink
          disabled={page >= pages}
          href={`${basePath}${qs({ ...params, page: page + 1 })}`}
          label="Next"
        />
      </div>
    </div>
  );
}

function PageLink({ href, label, disabled }: { href: string; label: string; disabled: boolean }) {
  if (disabled) {
    return (
      <span className="btn-secondary cursor-not-allowed opacity-40" aria-disabled>
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="btn-secondary">
      {label}
    </Link>
  );
}
