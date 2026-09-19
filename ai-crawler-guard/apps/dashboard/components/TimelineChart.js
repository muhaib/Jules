'use client';

import { useMemo, useState } from 'react';
import { barPath, niceTicks, useMeasure } from './useMeasure';
import { Tooltip } from './Tooltip';
import { nf, shortDate } from '../lib/format';

/**
 * Daily bot traffic, stacked by what the middleware did with each hit.
 *
 * Three series (identity, not severity), so categorical slots 1-3 in fixed
 * order. Legend is always present; the table below the chart is the accessible
 * view of the same numbers, which also discharges the light-mode contrast
 * relief requirement on the aqua slot.
 */
const SERIES = [
  { key: 'served', label: 'Served', color: 'var(--series-1)' },
  { key: 'licensed', label: 'Licensing page', color: 'var(--series-2)' },
  { key: 'blocked', label: 'Blocked', color: 'var(--series-3)' },
];

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 26, left: 44 };
const GAP = 2;

export function TimelineChart({ days }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  const max = Math.max(1, ...days.map((d) => d.served + d.licensed + d.blocked));
  const ticks = useMemo(() => niceTicks(max), [max]);
  const top = ticks[ticks.length - 1] || 1;

  const plotW = Math.max(40, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = days.length ? plotW / days.length : plotW;
  const barW = Math.min(24, Math.max(3, band - 6));
  const scale = (value) => (value / top) * plotH;

  if (!days.length) {
    return <p className="muted small" style={{ margin: 0 }}>No crawler traffic recorded in this range.</p>;
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={HEIGHT} role="img" aria-label="Daily AI crawler hits by outcome">
        {ticks.map((tick) => {
          const y = PAD.top + plotH - scale(tick);
          return (
            <g key={tick}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} stroke="var(--line)" strokeWidth="1" />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
                {nf.format(tick)}
              </text>
            </g>
          );
        })}

        {days.map((day, index) => {
          const x = PAD.left + index * band + (band - barW) / 2;
          const total = day.served + day.licensed + day.blocked;
          let cursor = PAD.top + plotH;
          const segments = SERIES.map((series) => {
            const raw = scale(day[series.key]);
            if (raw <= 0) return null;
            // A 2px surface gap separates touching segments.
            const h = Math.max(1, raw - GAP);
            cursor -= raw;
            return { series, y: cursor + GAP, h };
          }).filter(Boolean);

          return (
            <g
              key={day.day}
              onMouseEnter={() => setHover({ day, x: x + barW / 2, y: PAD.top + plotH - scale(total) })}
              onMouseLeave={() => setHover(null)}
            >
              {/* A hit target wider than the mark itself. */}
              <rect x={PAD.left + index * band} y={PAD.top} width={band} height={plotH} fill="transparent" />
              {segments.map(({ series, y, h }, i) => (
                <path
                  key={series.key}
                  d={barPath(x, y, barW, h, i === segments.length - 1 ? 4 : 0)}
                  fill={series.color}
                  opacity={hover && hover.day !== day ? 0.45 : 1}
                />
              ))}
            </g>
          );
        })}

        <line
          x1={PAD.left} x2={width - PAD.right}
          y1={PAD.top + plotH} y2={PAD.top + plotH}
          stroke="var(--line-strong)" strokeWidth="1"
        />
        {days.map((day, index) => {
          const step = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(width / 70))));
          if (index % step !== 0) return null;
          return (
            <text
              key={day.day}
              x={PAD.left + index * band + band / 2}
              y={HEIGHT - 8}
              textAnchor="middle" fontSize="11" fill="var(--text-muted)"
            >
              {shortDate(day.day)}
            </text>
          );
        })}
      </svg>

      {hover && (
        <Tooltip x={hover.x} y={hover.y} width={width}>
          <strong>{shortDate(hover.day.day)}</strong>
          {SERIES.map((series) => (
            <div key={series.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="dot" style={{ background: series.color }} />
              <span style={{ color: 'var(--text-secondary)' }}>{series.label}</span>
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {nf.format(hover.day[series.key])}
              </span>
            </div>
          ))}
        </Tooltip>
      )}

      <div className="legend" style={{ marginTop: 10 }}>
        {SERIES.map((series) => (
          <span className="item" key={series.key}>
            <span className="swatch" style={{ background: series.color }} />
            {series.label}
          </span>
        ))}
      </div>
    </div>
  );
}
