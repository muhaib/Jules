'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Render charts at their real pixel size rather than scaling a fixed viewBox,
 * so labels stay at the size they were designed at on every screen width.
 */
export function useMeasure(initial = 720) {
  const ref = useRef(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Rounded data-end, square baseline - the bar spec from the design system. */
export function barPath(x, y, w, h, r, direction = 'up') {
  const radius = Math.max(0, Math.min(r, h, w / 2));
  if (h <= 0) return '';
  if (direction === 'up') {
    return `M${x},${y + h} L${x},${y + radius} Q${x},${y} ${x + radius},${y} `
      + `L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} L${x + w},${y + h} Z`;
  }
  // 'right': square at the left baseline, rounded at the value end
  return `M${x},${y} L${x + w - radius},${y} Q${x + w},${y} ${x + w},${y + radius} `
    + `L${x + w},${y + h - radius} Q${x + w},${y + h} ${x + w - radius},${y + h} L${x},${y + h} Z`;
}

export function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks = [];
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(Math.round(value));
  return ticks;
}
