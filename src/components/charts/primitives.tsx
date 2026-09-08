'use client';

import type { ReactNode } from 'react';

import { CHART } from '@/components/charts/palette';

/** Shared tooltip so every chart in the product reads identically. */
export function ChartTooltip({
  active,
  payload,
  label,
  valueSuffix = '',
  labelFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  label?: string | number;
  valueSuffix?: string;
  labelFormatter?: (label: string | number) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2 shadow-pop">
      {label !== undefined && (
        <div className="mb-1 text-2xs font-medium text-muted">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <ul className="space-y-0.5">
        {payload.map((entry, i) => (
          <li key={`${entry.dataKey}-${i}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 rounded-sm"
              style={{ background: entry.color }}
              aria-hidden
            />
            <span className="text-muted">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-ink">
              {typeof entry.value === 'number' ? entry.value.toLocaleString('en-GB') : entry.value}
              {valueSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const AXIS_PROPS = {
  stroke: CHART.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export function ChartFrame({
  height = 240,
  children,
  empty,
}: {
  height?: number;
  children: ReactNode;
  empty?: boolean;
}) {
  if (empty) {
    return (
      <div
        className="flex items-center justify-center text-sm text-faint"
        style={{ height }}
      >
        No data in the selected range
      </div>
    );
  }
  return <div style={{ height }}>{children}</div>;
}
