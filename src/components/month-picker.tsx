'use client';

import { usePathname, useRouter } from 'next/navigation';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function MonthPicker({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const thisYear = new Date().getUTCFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2];

  const go = (y: number, m: number) => router.push(`${pathname}?year=${y}&month=${m}`);

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="report-month">
        Report month
      </label>
      <select
        id="report-month"
        className="input h-9 w-auto py-0"
        value={month}
        onChange={(e) => go(year, Number(e.target.value))}
      >
        {MONTHS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="report-year">
        Report year
      </label>
      <select
        id="report-year"
        className="input h-9 w-auto py-0"
        value={year}
        onChange={(e) => go(Number(e.target.value), month)}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
