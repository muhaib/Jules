'use client';

import { usePathname, useRouter } from 'next/navigation';

const OPTIONS = [7, 30, 90];

export function RangePicker({ current }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div style={{ display: 'flex', gap: 2 }} role="group" aria-label="Date range">
      {OPTIONS.map((days) => (
        <button
          key={days}
          type="button"
          className={days === current ? '' : 'ghost'}
          style={{ padding: '6px 12px', fontSize: 13 }}
          onClick={() => router.push(`${pathname}?days=${days}`)}
        >
          {days}d
        </button>
      ))}
    </div>
  );
}
