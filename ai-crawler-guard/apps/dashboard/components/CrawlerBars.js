'use client';

import { useState } from 'react';
import { barPath, useMeasure } from './useMeasure';
import { Tooltip } from './Tooltip';
import { nf } from '../lib/format';

/**
 * Hits per crawler. One measure, one series, so a single sequential hue - no
 * legend needed; the heading names what the bars are. Values are labelled at
 * the tip rather than read off a gridline.
 */
const ROW = 30;
const BAR = 18;
const LABEL_W = 148;

export function CrawlerBars({ rows, valueKey = 'hits' }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  if (!rows.length) {
    return <p className="muted small" style={{ margin: 0 }}>Nothing recorded yet.</p>;
  }

  const max = Math.max(1, ...rows.map((row) => row[valueKey]));
  const valueW = 56;
  const trackW = Math.max(40, width - LABEL_W - valueW);
  const height = rows.length * ROW;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg width={width} height={height} role="img" aria-label="AI crawler hits by crawler">
        {rows.map((row, index) => {
          const y = index * ROW;
          const w = Math.max(2, (row[valueKey] / max) * trackW);
          return (
            <g
              key={row.bot_id}
              onMouseEnter={() => setHover({ row, x: LABEL_W + w, y })}
              onMouseLeave={() => setHover(null)}
            >
              <rect x="0" y={y} width={width} height={ROW} fill="transparent" />
              <text
                x="0" y={y + ROW / 2 + 4} fontSize="12.5"
                fill="var(--text-primary)"
              >
                {row.bot_name ?? row.bot_id}
              </text>
              <path
                d={barPath(LABEL_W, y + (ROW - BAR) / 2, w, BAR, 4, 'right')}
                fill="var(--seq-400)"
                opacity={hover && hover.row !== row ? 0.5 : 1}
              />
              <text
                x={LABEL_W + w + 8} y={y + ROW / 2 + 4}
                fontSize="12" fill="var(--text-secondary)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {nf.format(row[valueKey])}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && (
        <Tooltip x={hover.x} y={hover.y} width={width}>
          <strong>{hover.row.bot_name ?? hover.row.bot_id}</strong>
          <div className="muted">{hover.row.operator}</div>
          <div>{nf.format(hover.row.hits)} hits across {nf.format(hover.row.pages)} pages</div>
          <div>{nf.format(hover.row.blocked)} blocked &middot; {nf.format(hover.row.licensed)} sent to licensing</div>
          <div>{nf.format(hover.row.verified)} verified &middot; {nf.format(hover.row.spoofed)} spoofed</div>
        </Tooltip>
      )}
    </div>
  );
}
